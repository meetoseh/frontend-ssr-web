import chalk from 'chalk';
import { colorNow } from '../logging';
import { RedisPipeline } from '../redis';
import { setIfLower } from '../redisHelpers/setIfLower';
import { CancelablePromise } from './CancelablePromise';
import { constructCancelablePromise } from './CancelablePromiseConstructor';
import { Itgs } from './Itgs';
import { createCancelablePromiseFromCallbacks } from './createCancelablePromiseFromCallbacks';
import { createFakeCancelable } from './createFakeCancelable';

type RedisStatsPreparerIncrbyArgs = {
  /**
   * The unix date when the event occurred, with days delineated by a
   * consistent timezone for the key
   */
  unixDate: number;

  /**
   * The format string for the basic key, e.g.,
   * "stats:touch_send:daily:{unixDate}"
   *
   * In order to determine which key to increment, we will replace
   * all instances of `{unixDate}` with the provided unix date
   * (in base 10).
   */
  basicKeyFormat: string;

  /**
   * The key that stores the earliest unix date for which there may still
   * be stats that haven't been processed yet. For example,
   * "stats:touch_send:daily:earliest". This allows the job that rotates
   * these stats to the database not to have to scan through all of the
   * keys to determine which ones need to be rotated.
   */
  earliestKey: string;

  /**
   * The event that occurred, which will correspond to the key within the
   * Hash at the basic key.
   */
  event: string;

  /**
   * If this event has a separate hash breaking it down further, the
   * format string to get to that hash, e.g.,
   * "stats:touch_send:daily:{unixDate}:extra:{event}".
   *
   * In order to determine which extra key to increment, we will replace
   * all instances of `{unixDate}` with the provided unix date, and
   * all instances of `{event}` with the provided event.
   */
  eventExtraFormat?: string;

  /**
   * If this event has a separate hash breaking it down further, the
   * subidentifier for the event. This corresponds to the key within
   * the eventExtra hash to increment.
   */
  eventExtra?: string;

  /**
   * The amount to increment both the event and, if applicable, the
   * eventExtra by. Defaults to 1.
   */
  amount?: number;
};

/**
 * Helper class for building what changes to write to Redis. This
 * is primarily intended for stats-related actions, e.g., increments.
 * Generally this is wrapped with additional, more specific helper
 * functions. For example:
 *
 * ```ts
 * const stats = new RedisStatsPreparer();
 *
 * declare const unixDate: number;
 * declare const itgs: Itgs;
 *
 * const linkStats = new ExampleLinkStatsPreparer(stats)
 * const viewStats = new ExampleViewStatsPreparer(stats);
 *
 * linkStats.incrLinksCreated(unixDate);
 * viewStats.incrViews(unixDate);
 *
 * await stats.store(itgs);
 * ```
 *
 * Alternatively, you can have pure functions rather than wrapping
 * the stats directly, though this mechanism can be much more annoying
 * when the same field name is used for two different stat keys:
 *
 * ```ts
 * const stats = new RedisStatsPreparer();
 *
 * declare const unixDate: number;
 * declare const itgs: Itgs;
 *
 * incrLinksCreated(stats, unixDate);
 * incrViews(stats, unixDate);
 *
 * await stats.store(itgs);
 * ```
 */
export class RedisStatsPreparer {
  /**
   * A dictionary from redis keys which point to Hash values to
   * which key/value pairs to increment within that hash and by how much
   */
  readonly stats: Map<string, Map<string, number>>;
  /**
   * A dictionary from redis keys which point to regular string values
   * to the unix date to set them to if either the key does not exist
   * or the existing value is later than the provided date.
   *
   * Dates are specified as unix dates in the appropriate timezone for
   * the key, see `unixDates.ts`
   */
  readonly earliestKeys: Map<string, number>;
  /**
   * A dictionary from redis keys which point to regular string values
   * to the amount by which to increment the value
   */
  readonly directStats: Map<string, number>;
  /**
   * A dictionary from redis keys to the expiration date to set on those
   * keys.
   */
  readonly expireKeys: Map<string, number>;

  constructor() {
    this.stats = new Map();
    this.earliestKeys = new Map();
    this.directStats = new Map();
    this.expireKeys = new Map();
  }

  /**
   * For a standard stats Hash with the given key, gets the map that
   * can be mutated to increment the values of the hash when store()
   * is called.
   *
   * If the map is not already initialized, it will be initialized
   */
  getForKey(key: string): Map<string, number> {
    let map = this.stats.get(key);
    if (map === undefined) {
      map = new Map();
      this.stats.set(key, map);
    }
    return map;
  }

  /**
   * For a standard string key containing a number, stores that we
   * should increment the value by the given amount when store()
   * is called.
   *
   * If this is called multiple times for the same key before store()
   * is called, the increments will be combined.
   */
  incrDirect(key: string, amount: number = 1): void {
    if (amount === 0) {
      return;
    }

    const current = this.directStats.get(key);
    if (current === undefined) {
      this.directStats.set(key, amount);
    } else {
      const newAmount = current + amount;
      if (newAmount === 0) {
        this.directStats.delete(key);
      } else {
        this.directStats.set(key, newAmount);
      }
    }
  }

  /**
   * For a standard string key containing a number interpreted as a unix
   * date, stores that we should set the value to the given date if
   * the existing value is later than the given date or if the key
   * does not exist, when store() is called.
   *
   * If this is called multiple times for the same key before store()
   * is called, the earliest date will be used (which will result in
   * the same behavior as if the operations weren't combined).
   */
  setEarliest(key: string, unixDate: number): void {
    const current = this.earliestKeys.get(key);
    if (current === undefined || current > unixDate) {
      this.earliestKeys.set(key, unixDate);
    }
  }

  /**
   * For any redis key type, stores that we should set the expiration
   * date, specified as seconds since the unix epoch, to the given
   * date when store() is called if the key exists at that time.
   *
   * If this is called multiple times for the same key before store()
   * is called, then `onDuplicate` determines what happens:
   * - 'error': throw an error
   * - 'earliest': combine the expiration dates by taking the earliest
   *   value.
   * - 'latest': combine the expiration dates by taking the latest
   *   value.
   *
   * If the key does not exist at the time of store(), then this does
   * nothing. This does not compare the expiration date of the key
   * at the time of store() to the expiration date specified here.
   */
  setExpiration(key: string, expireAt: number, onDuplicate?: 'error' | 'earliest' | 'latest') {
    onDuplicate = onDuplicate ?? 'error';

    const current = this.expireKeys.get(key);
    if (current === undefined) {
      this.expireKeys.set(key, expireAt);
    } else {
      switch (onDuplicate) {
        case 'error':
          throw new Error(`Duplicate expiration for key ${key}`);
        case 'earliest':
          if (current > expireAt) {
            this.expireKeys.set(key, expireAt);
          }
          break;
        case 'latest':
          if (current < expireAt) {
            this.expireKeys.set(key, expireAt);
          }
          break;
      }
    }
  }

  /**
   * The primary interface for this class. We generally have stats stored in
   * redis using the following pattern:
   *
   * - A Hash for each day, e.g., `stats:touch_send:daily:19472`
   * - A string value for the earliest day that has not yet been processed,
   *   e.g,. `stats:touch_send:daily:earliest`
   * - A Hash for each day and event, e.g., `stats:touch_send:daily:19472:extra:attempted`
   *
   * When an event occurs, we increment that key within the daily Hash, and then
   * for that events Hash we increment the sub key for the event. We also set
   * the earliest key to the lower of its current value and the unix date of the
   * event we just stored, ensuring that it gets rotated/cleaned up appropriately.
   *
   * Example:
   *
   * ```ts
   * stats.incrby({
   *   unixDate: 19472,
   *   basicKeyFormat: 'stats:touch_send:daily:{unixDate}',
   *   earliestKey: 'stats:touch_send:daily:earliest',
   *   event: 'attempted',
   *   eventExtraFormat: 'stats:touch_send:daily:{unixDate}:extra:{event}',
   *   eventExtra: 'daily_reminder:sms',
   * })
   * ```
   */
  incrby({
    unixDate,
    basicKeyFormat,
    earliestKey,
    event,
    eventExtraFormat,
    eventExtra,
    amount,
  }: RedisStatsPreparerIncrbyArgs) {
    if (process.env.ENVIRONMENT === 'dev') {
      if (basicKeyFormat.includes('{unix_date}')) {
        throw new Error(`basicKeyFormat has {unix_date}; did you mean {unixDate}?`);
      }
      if (eventExtraFormat !== undefined && eventExtraFormat.includes('{unix_date}')) {
        throw new Error(`eventExtraFormat has {unix_date}; did you mean {unixDate}?`);
      }
    }

    amount = amount ?? 1;
    if (amount === 0) {
      return;
    }

    this.setEarliest(earliestKey, unixDate);
    const basicKey = basicKeyFormat.replace('{unixDate}', unixDate.toString(10));
    const basicMap = this.getForKey(basicKey);
    const basicAmount = basicMap.get(event);
    if (basicAmount === undefined) {
      basicMap.set(event, amount);
    } else {
      const newAmount = basicAmount + amount;
      if (newAmount === 0) {
        basicMap.delete(event);
        if (basicMap.size === 0) {
          this.stats.delete(basicKey);
        }
      } else {
        basicMap.set(event, newAmount);
      }
    }

    if (eventExtraFormat !== undefined && eventExtra !== undefined) {
      const eventExtraKey = eventExtraFormat
        .replace('{unixDate}', unixDate.toString(10))
        .replace('{event}', event);
      const eventExtraMap = this.getForKey(eventExtraKey);
      const eventExtraAmount = eventExtraMap.get(eventExtra);
      if (eventExtraAmount === undefined) {
        eventExtraMap.set(eventExtra, amount);
      } else {
        const newAmount = eventExtraAmount + amount;
        if (newAmount === 0) {
          eventExtraMap.delete(eventExtra);
          if (eventExtraMap.size === 0) {
            this.stats.delete(eventExtraKey);
          }
        } else {
          eventExtraMap.set(eventExtra, newAmount);
        }
      }
    }
  }

  /**
   * Merges all stats from the other preparer into this one, which allows
   * for returning stats preparers rather than passing them around, when
   * convenient.
   */
  mergeWith(
    other: RedisStatsPreparer,
    opts?: {
      /**
       * Determines how to manage if there are expiration dates set for the same
       * key on both this and the other RedisStatsPreparer. See `setExpiration`
       * for more details.
       *
       * @default 'error'
       */
      onDuplicateExpirations?: 'error' | 'earliest' | 'latest';
    }
  ) {
    for (const [key, updates] of other.stats.entries()) {
      const data = this.getForKey(key);
      for (const [event, amount] of updates.entries()) {
        if (amount === 0) {
          continue;
        }

        const current = data.get(event);
        const newAmount = (current ?? 0) + amount;
        if (newAmount !== 0) {
          data.set(event, newAmount);
        } else if (current !== undefined) {
          data.delete(event);
        }
      }

      if (data.size === 0) {
        this.stats.delete(key);
      }
    }

    for (const [key, unixDate] of other.earliestKeys.entries()) {
      this.setEarliest(key, unixDate);
    }

    for (const [key, amount] of other.directStats.entries()) {
      this.incrDirect(key, amount);
    }

    for (const [key, expireAt] of other.expireKeys.entries()) {
      this.setExpiration(key, expireAt, opts?.onDuplicateExpirations);
    }
  }

  /**
   * Queues the changes caused by `setEarliest` or equivalents to be written
   * to the given pipe once `exec()` is called.
   *
   * This requires that the `setIfLower` redis script has already been initialized
   * and ensured to exist.
   */
  writeEarliest(pipe: RedisPipeline): void {
    for (const [key, unixDate] of this.earliestKeys.entries()) {
      setIfLower.executeInPipeRequireLoaded(pipe, { key, value: unixDate });
      console.log(
        `${colorNow()} ${chalk.gray('redis stats:')} ${chalk.white(
          `setIfLower ${key} ${unixDate}`
        )}`
      );
    }
  }

  /**
   * Queues the changes caused by `getForKey` or equivalents to be written
   * to the given pipe once `exec()` is called.
   */
  writeIncrements(pipe: RedisPipeline): void {
    for (const [key, updates] of this.stats.entries()) {
      for (const [subkey, amt] of updates.entries()) {
        pipe.hIncrBy(key, subkey, amt);
        console.log(
          `${colorNow()} ${chalk.gray('redis stats:')} ${chalk.white(
            `hIncrBy ${key} ${subkey} ${amt}`
          )}`
        );
      }
    }
  }

  /**
   * Queues the changes caused by `setExpiration` or equivalents to be written
   * to the given pipe once `exec()` is called.
   */
  writeExpirations(pipe: RedisPipeline): void {
    for (const [key, expireAt] of this.expireKeys.entries()) {
      pipe.expireAt(key, expireAt);
      console.log(
        `${colorNow()} ${chalk.gray('redis stats:')} ${chalk.white(`expireAt ${key} ${expireAt}`)}`
      );
    }
  }

  /**
   * Queues the changes caused by `incrDirect` or equivalents to be written
   * to the given pipe once `exec()` is called.
   */
  writeDirectIncrements(pipe: RedisPipeline): void {
    for (const [key, amt] of this.directStats.entries()) {
      pipe.incrBy(key, amt);
      console.log(
        `${colorNow()} ${chalk.gray('redis stats:')} ${chalk.white(`incrBy ${key} ${amt}`)}`
      );
    }
  }

  /**
   * Convenience function to use the default redis instance associated with the
   * given Itgs instance to write the changes queued by this object, if any,
   * to redis.
   */
  store(itgs: Itgs): CancelablePromise<void> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        if (
          this.stats.size === 0 &&
          this.earliestKeys.size === 0 &&
          this.directStats.size === 0 &&
          this.expireKeys.size === 0
        ) {
          state.finishing = true;
          state.done = true;
          resolve();
          return;
        }

        const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
        canceled.promise.catch(() => {});

        const handleCanceled = (): boolean => {
          if (!state.finishing) {
            return false;
          }

          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return true;
        };

        if (handleCanceled()) {
          canceled.cancel();
          return;
        }

        const redis = await itgs.redis();
        const ensureScript = async (force: boolean) => {
          const ensurePromise = setIfLower.ensureExists(redis, force);
          state.cancelers.add(ensurePromise.cancel);
          if (state.finishing) {
            ensurePromise.cancel();
          }
          try {
            await ensurePromise.promise;
          } catch (e) {
            canceled.cancel();
            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(e);
            }
          }
        };

        const executeScript = async (): Promise<'success' | 'noscript' | 'failure'> => {
          const multi = redis.multi();
          this.writeEarliest(multi);
          this.writeIncrements(multi);
          this.writeDirectIncrements(multi);
          this.writeExpirations(multi);

          const commandPromise = multi.exec();
          try {
            await Promise.race([commandPromise, canceled.promise]);
          } catch (e) {
            let message: string | undefined = undefined;
            if (e instanceof Error) {
              message = e.message;
            } else if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              message = e.message;
            }

            if (message !== undefined && message.startsWith('NOSCRIPT')) {
              return 'noscript';
            }

            canceled.cancel();
            state.finishing = true;
            commandPromise.catch(() => {});
            if (!state.done) {
              state.done = true;
              reject(e);
            }
            return 'failure';
          }

          if (handleCanceled()) {
            canceled.cancel();
            return 'failure';
          }

          state.finishing = true;
          state.done = true;
          resolve();
          return 'success';
        };

        await ensureScript(false);
        if (handleCanceled()) {
          canceled.cancel();
          return;
        }

        const initialResult = await executeScript();
        if (initialResult !== 'noscript') {
          return;
        }

        await ensureScript(true);
        if (handleCanceled()) {
          canceled.cancel();
          return;
        }

        const finalResult = await executeScript();
        if (finalResult === 'noscript') {
          state.finishing = true;
          state.done = true;
          reject(new Error('NOSCRIPT: script still did not exist after force load'));
        }
      },
    });
  }
}

/**
 * Executes the given function, then regardless of if it resolves or
 * rejects, stores any stats that were queued to the provided stats
 * preparer to the standard redis instance associated with the given
 * Itgs instance.
 *
 * @param itgs the integrations to (re)use
 * @param fn the function to execute
 * @returns the result of the function
 */
export const withRedisStats = <T>(
  itgs: Itgs,
  fn: (stats: RedisStatsPreparer) => CancelablePromise<T>
): CancelablePromise<T> => {
  return constructCancelablePromise({
    body: async (state, resolve, reject) => {
      if (state.finishing) {
        if (!state.done) {
          state.done = true;
          reject(new Error('canceled'));
        }
        return;
      }

      const stats = new RedisStatsPreparer();
      const resultWrapped = fn(stats);
      state.cancelers.add(resultWrapped.cancel);
      if (state.finishing) {
        resultWrapped.cancel();
      }

      let result: T = undefined as T;
      let resultError: unknown | undefined = undefined;
      let resultDidError = false;
      try {
        result = await resultWrapped.promise;
      } catch (e) {
        if (state.finishing) {
          state.done = true;
          reject(e);
          return;
        }

        resultError = e;
        resultDidError = true;
      } finally {
        state.cancelers.remove(resultWrapped.cancel);
      }

      const storeCancelable = stats.store(itgs);
      state.cancelers.add(storeCancelable.cancel);
      if (state.finishing) {
        storeCancelable.cancel();
      }
      try {
        await storeCancelable.promise;
      } catch (e) {
        state.finishing = true;
        state.done = true;
        reject(e);
        return;
      } finally {
        state.cancelers.remove(storeCancelable.cancel);
      }

      state.finishing = true;
      state.done = true;
      if (resultDidError) {
        reject(resultError);
      } else {
        resolve(result);
      }
    },
  });
};

/**
 * A variant of `withRedisStats` where the inner function is non-cancelable;
 * typically this is appropriate to use if you're already in a cancelable context,
 * since if you detect the outer context is canceled that may be good enough.
 *
 * @param itgs The integrations to (re)use
 * @param fn The function to execute
 * @returns The result of the function
 */
export const withRedisStatsUsingPromise = <T>(
  itgs: Itgs,
  fn: (stats: RedisStatsPreparer) => Promise<T>
): CancelablePromise<T> => {
  return withRedisStats(itgs, (stats) => createFakeCancelable(() => fn(stats)));
};
