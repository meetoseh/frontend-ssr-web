import { CancelablePromise } from '../lib/CancelablePromise';
import { constructCancelablePromise } from '../lib/CancelablePromiseConstructor';
import { RedisClient, RedisPipeline } from '../redis';
import {
  WritableValueWithCallbacks,
  createWritableValueWithCallbacks,
} from '../uikit/lib/Callbacks';
import { createHash } from 'crypto';
import fs from 'fs';
import { createCancelablePromiseFromCallbacks } from '../lib/createCancelablePromiseFromCallbacks';

export type RedisScript<Args extends object, ParsedResult> = {
  /**
   * Ensures that the script exists within the redis client at the
   * time that this is called. This may skip actually uploading the
   * script if it can positively confirm the script exists using
   * SCRIPT EXISTS.
   *
   * If force is unset or false, this will no-op if we've recently
   * checked that the script existed.
   */
  ensureExists: (redis: RedisClient, force?: boolean) => CancelablePromise<void>;

  /**
   * Queues the script to be executed within the given pipeline. This will
   * not perform any redis interactions, but may need time to load the
   * script and corresponding sha, hence the CancelablePromise.
   */
  executeInPipe: (redis: RedisPipeline, args: Args) => CancelablePromise<void>;

  /**
   * Equivalent to executeInPipe, but requires that ensureExists has already
   * been called and allowed to complete successfully, and in return can
   * be synchronous.
   */
  executeInPipeRequireLoaded: (redis: RedisPipeline, args: Args) => void;

  /**
   * Attempts to execute the script, retrying on a NOSCRIPT error
   * at most once.
   */
  execute: (redis: RedisClient, args: Args) => CancelablePromise<ParsedResult>;

  /**
   * Parses the raw result of the command, as it might be returned
   * from exec() when indexed appropriately. This is typically used
   * in conjunction with `executeInPipe` when this script is executed
   * alongside other commands within a transaction.
   */
  parseRawResult: (raw: unknown) => ParsedResult;
};

export type RedisScriptArgs = {
  keys: string[];
  argv: string[];
};

export type RedisScriptArgsMapper<Args extends object> = (args: Args) => RedisScriptArgs;
export type RedisScriptResultParser<ParsedResult> = (raw: unknown) => ParsedResult;

class _RedisScript<Args extends object, ParsedResult> {
  private readonly scriptPath: string;
  private readonly argsMapper: RedisScriptArgsMapper<Args>;
  private readonly resultParser: RedisScriptResultParser<ParsedResult>;

  private readonly script: WritableValueWithCallbacks<
    { source: string; sha1: string } | 'pending' | null
  >;
  private readonly lastChecked: WritableValueWithCallbacks<number | 'pending' | null>;

  constructor(
    scriptPath: string,
    argsMapper: RedisScriptArgsMapper<Args>,
    resultParser: RedisScriptResultParser<ParsedResult>
  ) {
    this.scriptPath = scriptPath;
    this.argsMapper = argsMapper;
    this.resultParser = resultParser;

    this.script = createWritableValueWithCallbacks<
      { source: string; sha1: string } | 'pending' | null
    >(null);
    this.lastChecked = createWritableValueWithCallbacks<number | 'pending' | null>(null);
  }

  /**
   * Always loads the script from the file and hashes it.
   *
   * Uses a reasonably efficient, cancelable approach that works for
   * small or large scripts alike
   */
  private _loadScript(): CancelablePromise<{ source: string; sha1: string }> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        if (state.finishing) {
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        const hasher = createHash('sha1');
        const scriptParts: string[] = [];

        try {
          const fileSize = (await fs.promises.stat(this.scriptPath)).size;

          const handle = await fs.promises.open(this.scriptPath, 'r');
          try {
            let buffer = Buffer.alloc(Math.max(Math.min(8192, fileSize), 8));
            while (true) {
              const { bytesRead } = await handle.read(buffer, 0, buffer.length);
              if (bytesRead === 0) {
                break;
              }

              if (state.finishing) {
                if (!state.done) {
                  state.done = true;
                  reject(new Error('canceled'));
                }
                return;
              }

              const subarray = buffer.subarray(0, bytesRead);
              hasher.update(subarray);
              scriptParts.push(subarray.toString('utf-8'));

              if (scriptParts.length > 1 && buffer.length < 8192) {
                // We're under concurrent modification or our stat was wrong; either
                // way, we need to ensure our buffer is a reasonable size for an arbitrary
                // length file
                buffer = Buffer.alloc(8192);
              }
            }
          } finally {
            await handle.close();
          }

          state.finishing = true;
          const sha1 = hasher.digest('hex');
          const source = scriptParts.join('');
          state.done = true;
          resolve({ source, sha1 });
        } catch (e) {
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        }
      },
    });
  }

  /**
   * Returns the script, loading it from disk if necessary, cooperating with
   * other calls to this function to ensure that the script is only loaded
   * once.
   */
  private _getScript(): CancelablePromise<{ source: string; sha1: string }> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
        canceled.promise.catch(() => {});

        if (state.finishing) {
          canceled.cancel();
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        while (true) {
          if (state.finishing) {
            canceled.cancel();
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          const scriptChanged = createCancelablePromiseFromCallbacks(this.script.callbacks);
          scriptChanged.promise.catch(() => {});

          const script = this.script.get();
          if (script !== null && script !== 'pending') {
            scriptChanged.cancel();
            canceled.cancel();
            state.finishing = true;
            state.done = true;
            resolve(script);
            return;
          }

          if (script === null) {
            scriptChanged.cancel();
            canceled.cancel();

            this.script.set('pending');
            this.script.callbacks.call(undefined);

            try {
              const loadCancelable = this._loadScript();
              state.cancelers.add(loadCancelable.cancel);
              if (state.finishing) {
                loadCancelable.cancel();
              }

              const result = await loadCancelable.promise;
              state.cancelers.remove(loadCancelable.cancel);
              this.script.set(result);
              this.script.callbacks.call(undefined);

              state.finishing = true;
              state.done = true;
              resolve(result);
              return;
            } catch (e) {
              this.script.set(null);
              this.script.callbacks.call(undefined);
              state.finishing = true;
              if (!state.done) {
                state.done = true;
                reject(e);
              }
              return;
            }
          }

          try {
            await Promise.race([scriptChanged.promise, canceled.promise]);
          } catch (e) {}

          scriptChanged.cancel();
        }
      },
    });
  }

  private _doCheck(
    redis: RedisClient,
    script: { source: string; sha1: string }
  ): CancelablePromise<void> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
        canceled.promise.catch(() => {});

        if (state.finishing) {
          canceled.cancel();
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        const existsPromise = redis.scriptExists(script.sha1);
        try {
          await Promise.race([existsPromise, canceled.promise]);
        } catch (e) {}

        if (state.finishing) {
          existsPromise.catch(() => {});
          canceled.cancel();
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        try {
          const commandResult = await existsPromise;
          if (commandResult[0]) {
            canceled.cancel();
            state.finishing = true;
            state.done = true;
            resolve();
            return;
          }
        } catch (e) {
          canceled.cancel();
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        }

        const loadPromise = redis.scriptLoad(script.source);
        try {
          await Promise.race([loadPromise, canceled.promise]);
        } catch (e) {}

        if (state.finishing) {
          loadPromise.catch(() => {});
          canceled.cancel();
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        canceled.cancel();
        try {
          const commandResult = await loadPromise;
          if (commandResult === script.sha1) {
            state.finishing = true;
            state.done = true;
            resolve();
            return;
          }

          state.finishing = true;
          state.done = true;
          reject(new Error(`sha1 mismatch; expected ${script.sha1}, got ${commandResult}`));
          return;
        } catch (e) {
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        }
      },
    });
  }

  private _ensureExists(
    redis: RedisClient,
    force?: boolean
  ): CancelablePromise<{ source: string; sha1: string }> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        const reallyCheck = async () => {
          const scriptCancelable = this._getScript();
          state.cancelers.add(scriptCancelable.cancel);
          if (state.finishing) {
            scriptCancelable.cancel();
          }

          let script: { source: string; sha1: string };
          try {
            script = await scriptCancelable.promise;
          } catch (e) {
            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(e);
            }
            return;
          } finally {
            state.cancelers.remove(scriptCancelable.cancel);
          }

          const checkAt = Date.now();
          const checkCancelable = this._doCheck(redis, script);
          state.cancelers.add(checkCancelable.cancel);
          if (state.finishing) {
            checkCancelable.cancel();
          }

          try {
            await checkCancelable.promise;
            state.finishing = true;
            this.lastChecked.set(checkAt);
            this.lastChecked.callbacks.call(undefined);
            state.done = true;
            resolve(script);
          } catch (e) {
            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(e);
            }
            return;
          } finally {
            state.cancelers.remove(checkCancelable.cancel);
          }
        };

        if (force) {
          await reallyCheck();
          return;
        }

        const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
        canceled.promise.catch(() => {});

        while (true) {
          if (state.finishing) {
            canceled.cancel();

            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          const lastCheckedChanged = createCancelablePromiseFromCallbacks(
            this.lastChecked.callbacks
          );
          lastCheckedChanged.promise.catch(() => {});

          const lastChecked = this.lastChecked.get();
          if (lastChecked !== null && lastChecked !== 'pending') {
            lastCheckedChanged.cancel();
            canceled.cancel();
            state.finishing = true;
            const script = this.script.get();
            state.done = true;
            if (script === null || script === 'pending') {
              reject(new Error('script null or pending but lastChecked is set?'));
            } else {
              resolve(script);
            }
            return;
          }

          if (lastChecked === null) {
            lastCheckedChanged.cancel();
            canceled.cancel();
            await reallyCheck();
            return;
          }

          try {
            await Promise.race([lastCheckedChanged.promise, canceled.promise]);
          } catch (e) {}

          lastCheckedChanged.cancel();
        }
      },
    });
  }

  ensureExists(redis: RedisClient, force?: boolean): CancelablePromise<void> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        const scriptCancelable = this._ensureExists(redis, force);
        state.cancelers.add(scriptCancelable.cancel);
        if (state.finishing) {
          scriptCancelable.cancel();
        }

        try {
          await scriptCancelable.promise;
          state.finishing = true;
          state.done = true;
          resolve();
        } catch (e) {
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        } finally {
          state.cancelers.remove(scriptCancelable.cancel);
        }
      },
    });
  }

  executeInPipe(pipe: RedisPipeline, args: Args): CancelablePromise<void> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        if (state.finishing) {
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        let preppedArgs: RedisScriptArgs;
        try {
          preppedArgs = this.argsMapper(args);
        } catch (e) {
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        }

        const scriptCancelable = this._getScript();
        state.cancelers.add(scriptCancelable.cancel);
        if (state.finishing) {
          scriptCancelable.cancel();
        }

        let script: { source: string; sha1: string };
        try {
          script = await scriptCancelable.promise;
        } catch (e) {
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        } finally {
          state.cancelers.remove(scriptCancelable.cancel);
        }

        state.finishing = true;
        pipe.evalSha(script.sha1, {
          keys: preppedArgs.keys,
          arguments: preppedArgs.argv,
        });
        state.done = true;
        resolve();
      },
    });
  }

  executeInPipeRequireLoaded(pipe: RedisPipeline, args: Args): void {
    const script = this.script.get();
    if (script === null || script === 'pending') {
      throw new Error('script not loaded');
    }

    const preppedArgs = this.argsMapper(args);
    pipe.evalSha(script.sha1, {
      keys: preppedArgs.keys,
      arguments: preppedArgs.argv,
    });
  }

  execute(redis: RedisClient, args: Args): CancelablePromise<ParsedResult> {
    return constructCancelablePromise({
      body: async (state, resolve, reject) => {
        const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
        canceled.promise.catch(() => {});

        if (state.finishing) {
          canceled.cancel();
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }

        let preppedArgs: RedisScriptArgs;
        try {
          preppedArgs = this.argsMapper(args);
        } catch (e) {
          canceled.cancel();
          state.finishing = true;
          if (!state.done) {
            state.done = true;
            reject(e);
          }
          return;
        }

        const checkAndGetResult = async (force: boolean) => {
          const scriptCancelable = this._ensureExists(redis, force);
          state.cancelers.add(scriptCancelable.cancel);

          let script: { source: string; sha1: string };
          try {
            script = await scriptCancelable.promise;
          } catch (e) {
            canceled.cancel();
            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(e);
            }
            return;
          } finally {
            state.cancelers.remove(scriptCancelable.cancel);
          }

          const commandPromise = redis.evalSha(script.sha1, {
            keys: preppedArgs.keys,
            arguments: preppedArgs.argv,
          });
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
              return;
            } else {
              commandPromise.catch(() => {});
              canceled.cancel();
              state.finishing = true;
              if (!state.done) {
                state.done = true;
                reject(e);
              }
              return;
            }
          }

          if (state.finishing) {
            commandPromise.catch(() => {});
            canceled.cancel();
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          state.finishing = true;
          canceled.cancel();

          try {
            const result = await commandPromise;
            const resultParsed = this.resultParser(result);
            state.done = true;
            resolve(resultParsed);
            return;
          } catch (e) {
            if (!state.done) {
              state.done = true;
              reject(e);
            }
            return;
          }
        };

        await checkAndGetResult(false);
        if (state.finishing) {
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }
        await checkAndGetResult(true);
        if (state.finishing) {
          if (!state.done) {
            state.done = true;
            reject(new Error('canceled'));
          }
          return;
        }
        state.finishing = true;
        state.done = true;
        reject(new Error('NOSCRIPT: script still did not exist after retry'));
      },
    });
  }

  parseRawResult(raw: unknown): ParsedResult {
    return this.resultParser(raw);
  }
}

export const createRedisScript = <Args extends object, ParsedResult>(
  scriptPath: string,
  argsMapper: RedisScriptArgsMapper<Args>,
  resultParser: RedisScriptResultParser<ParsedResult>
): RedisScript<Args, ParsedResult> => {
  return new _RedisScript(scriptPath, argsMapper, resultParser);
};
