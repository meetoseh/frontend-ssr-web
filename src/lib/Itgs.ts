import { RqliteConnection } from 'rqdb';
import {
  Callbacks,
  ValueWithCallbacks,
  createWritableValueWithCallbacks,
} from '../uikit/lib/Callbacks';
import { AsyncLock, createLock } from './createLock';
import redis from 'redis';
import { HostAndPort, RedisClient, discoverMasterUsingSentinels } from '../redis';
import { constructCancelablePromise } from './CancelablePromiseConstructor';
import { CancelablePromise } from './CancelablePromise';
import { createCancelablePromiseFromCallbacks } from './createCancelablePromiseFromCallbacks';
import { colorNow } from '../logging';
import { inspect } from 'util';
import chalk from 'chalk';
import os from 'os';
import { sendMessageTo } from '../slack';

/**
 * Lazily initialized integrations to just about everything. Should only be
 * initialized using withItgs, with caution to ensure the reference does not
 * leak
 */
class Itgs {
  private _rqdb: RqliteConnection | undefined;
  private _redis: RedisClient | undefined;
  private readonly lock: AsyncLock;
  private cleanedUp: boolean;
  private readonly cleanup: Callbacks<undefined>;
  private readonly cleaningUp: Callbacks<undefined>;
  /**
   * Where to emit errors that break the standard Promise flow. Notably, this
   * is required because of the extremely impractical technique used by the redis
   * library to handle errors
   */
  private readonly onOutOfBandError: (err: any) => void;

  constructor(onOutOfBandError: (err: any) => void) {
    this.cleanedUp = false;
    this.cleanup = new Callbacks();
    this.cleaningUp = new Callbacks();
    this.onOutOfBandError = onOutOfBandError;
    this.lock = createLock();
  }

  /**
   * Retrieves connection to the RQLite cluster, our database
   */
  async conn(): Promise<RqliteConnection> {
    this.checkClosed();

    if (this._rqdb === undefined) {
      await this.lock.runSyncWithLock(() => {
        if (this.cleanedUp || this._rqdb !== undefined) {
          return;
        }

        const rqliteIpsRaw = process.env.RQLITE_IPS;
        if (rqliteIpsRaw === undefined) {
          throw new Error('Missing environment variable RQLITE_IPS');
        }

        const rqliteIps = rqliteIpsRaw.split(',');
        const rqliteHosts = rqliteIps.map((ip) => `http://${ip}:4001`);

        this._rqdb = new RqliteConnection(rqliteHosts, {
          log: {
            slowQuery: {
              enabled: true,
              thresholdSeconds: 0.5,
              method: (query, details) =>
                sendMessageTo(
                  'web-errors',
                  `frontend-ssr-web ${os.hostname()} slow query:\n\n` +
                    '```\n' +
                    inspect(query.operations, { colors: false }) +
                    '\n```\n took ' +
                    details.durationSeconds.toLocaleString('en-US', { maximumFractionDigits: 3 }) +
                    's'
                ),
            },
          },
        });
      }).promise;
      this.checkClosed();
      if (this._rqdb === undefined) {
        throw new Error('Unexpected undefined _rqdb');
      }
    }

    return this._rqdb;
  }

  /**
   * Connects to the current master instance of redis; will be
   * disconnected if the master rotates while the itgs is open.
   */
  async redis(): Promise<RedisClient> {
    this.checkClosed();

    if (this._redis === undefined) {
      await this.lock.runWithLock(() =>
        constructCancelablePromise<void>({
          body: async (state, resolve, reject) => {
            if (this.cleanedUp || this._redis !== undefined) {
              state.finishing = true;
              state.done = true;
              if (this.cleanedUp) {
                reject(new Error('canceled'));
              } else {
                resolve();
              }
              return;
            }

            const redisIpsRaw = process.env.REDIS_IPS;
            if (redisIpsRaw === undefined) {
              state.finishing = true;
              state.done = true;
              reject(new Error('Missing environment variable REDIS_IPS'));
              return;
            }

            const redisIps = redisIpsRaw.split(',');
            const redisSentinelIps: HostAndPort[] = redisIps.map((ip) => ({
              host: ip,
              port: 26379,
            }));

            const masterCancelable = discoverMasterUsingSentinels({
              sentinels: redisSentinelIps,
              minOtherSentinels: Math.floor(redisIps.length / 2),
              maxRetries: 2,
            });
            this.cleaningUp.add(masterCancelable.cancel);
            state.cancelers.add(masterCancelable.cancel);

            let master: HostAndPort;
            try {
              master = await masterCancelable.promise;
            } catch (e) {
              this.cleaningUp.remove(masterCancelable.cancel);
              state.cancelers.remove(masterCancelable.cancel);
              masterCancelable.cancel();
              state.finishing = true;
              if (!state.done) {
                state.done = true;
                reject(e);
              }
              return;
            }

            this.cleaningUp.remove(masterCancelable.cancel);
            state.cancelers.remove(masterCancelable.cancel);

            const client = redis.createClient({
              url: `redis://${master.host}:${master.port}`,
              socket: {
                connectTimeout: 2000,
                reconnectStrategy: false,
              },
            });
            const cleanupClient = () => {
              client
                .disconnect()
                .catch(() => {})
                .finally(() => {
                  client.quit().catch(() => {});
                });
            };

            this.cleanup.add(cleanupClient);
            try {
              const cleaningUp = this.cleaningUp;
              await new Promise<void>((resolve, reject) => {
                if (this.cleanedUp) {
                  reject(new Error('canceled'));
                  return;
                }
                addCallbacks();
                client.connect();

                function addCallbacks() {
                  client.on('ready', onReady);
                  client.on('error', onError);
                  state.cancelers.add(onCanceled);
                  cleaningUp.add(onCanceled);
                }

                function removeCallbacks() {
                  client.removeListener('ready', onReady);
                  client.removeListener('error', onError);
                  state.cancelers.remove(onCanceled);
                  cleaningUp.remove(onCanceled);
                }

                function onReady() {
                  removeCallbacks();
                  resolve();
                }

                function onError(err: any) {
                  removeCallbacks();
                  reject(new Error(`failed to connect to master: ${err}`));
                }

                function onCanceled() {
                  removeCallbacks();
                  reject(new Error('canceled'));
                }
              });
            } catch (e) {
              cleanupClient();
              this.cleanup.remove(cleanupClient);
              state.finishing = true;
              if (!state.done) {
                state.done = true;
                reject(e);
              }
              return;
            }

            if (this.cleanedUp) {
              cleanupClient();
              this.cleanup.remove(cleanupClient);
              state.finishing = true;
              if (!state.done) {
                state.done = true;
                reject(new Error('canceled'));
              }
              return;
            }

            const handleError = (err: any) => {
              this.onOutOfBandError(err);
            };

            client.addListener('error', handleError);
            this._redis = client;

            const fullCleanup = () => {
              this._redis = undefined;
              cleanupClient();
              client.removeListener('error', handleError);
            };

            this.cleanup.remove(cleanupClient);
            this.cleanup.add(fullCleanup);
            state.finishing = true;
            state.done = true;
            resolve();
          },
        })
      ).promise;
      this.checkClosed();
      if (this._redis === undefined) {
        throw new Error('Unexpected undefined _redis');
      }
    }

    return this._redis;
  }

  private checkClosed() {
    if (this.cleanedUp) {
      throw new Error('Cannot access conn after close');
    }
  }

  /**
   * Closes any unmanaged resources created by this instance. This
   * is called automatically by withItgs.
   *
   * After this is called, all getters will error.
   */
  async close() {
    if (this.cleanedUp) {
      return;
    }

    this.cleanedUp = true;
    this.cleaningUp.call(undefined);
    await this.lock.runSyncWithLock(() => {
      this.cleanup.call(undefined);
    }).promise;
  }
}

export type { Itgs };

/**
 * Invokes the given function with an integrations instance which is closed
 * once the promise resolves or rejects. The function must be careful not
 * to leak the integrations instance.
 *
 * Since the function is not cancelable, it must have handle out of band
 * errors itself.
 */
export const withItgs = async <T>(
  fn: (itgs: Itgs, outOfBandError: ValueWithCallbacks<any | undefined>) => Promise<T>
): Promise<T> => {
  const outOfBandError = createWritableValueWithCallbacks(undefined);
  const itgs = new Itgs((e) => {
    outOfBandError.set(e);
    outOfBandError.callbacks.call(undefined);
  });
  try {
    return await fn(itgs, outOfBandError);
  } finally {
    await itgs.close();
  }
};

/**
 * Executes the given cancelable function with an integrations instance which
 * is closed once the promise resolves or rejects. The function must be careful
 * not to leak the integrations instance. Rejecting the returned cancelable will
 * reject the cancelable returned by the provided function.
 *
 * If an out of band error occurs, the underlying function is canceled and the
 * returned promise rejects with the error.
 *
 * @param fn The function to execute
 * @returns A cancelable promise which fulfills like the result of the function
 *   unless immediately canceled, in which case it rejects with an error
 *   indicating it was canceled.
 */
export const withItgsCancelable = <T>(
  fn: (itgs: Itgs) => CancelablePromise<T>
): CancelablePromise<T> => {
  return constructCancelablePromise<T>({
    body: async (state, resolve, reject) => {
      if (state.finishing) {
        if (!state.done) {
          state.done = true;
          reject(new Error('canceled'));
        }
        return;
      }

      const outOfBandError = createWritableValueWithCallbacks(undefined);
      const hadOutOfBandError = createCancelablePromiseFromCallbacks(outOfBandError.callbacks);
      hadOutOfBandError.promise.catch(() => {});

      const itgs = new Itgs((e) => {
        outOfBandError.set(e);
        outOfBandError.callbacks.call(undefined);
      });

      try {
        const res = fn(itgs);
        state.cancelers.add(res.cancel);
        if (state.finishing) {
          res.cancel();
        }
        await Promise.race([res.promise, hadOutOfBandError.promise]);
        if (hadOutOfBandError.done()) {
          const err = outOfBandError.get();
          console.log(
            `${colorNow()} ${chalk.redBright(
              'withItgsCancelable handling out of band error'
            )} ${inspect(err, {
              colors: true,
            })}`
          );
          res.cancel();
          try {
            await res.promise;
          } catch (e) {
            console.log(
              `${colorNow()} ${chalk.gray(
                'ignoring error from canceled withItgsCancelable promise'
              )} ${inspect(e, {
                colors: true,
              })}`
            );
          }
          throw err;
        }
        const val = await res.promise;
        state.finishing = true;
        state.done = true;
        resolve(val);
      } catch (e) {
        state.finishing = true;
        state.done = true;
        reject(e);
      } finally {
        hadOutOfBandError.cancel();
      }
    },
  });
};
