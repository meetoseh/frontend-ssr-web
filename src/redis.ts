import * as redis from 'redis';
import { createCancelableTimeout } from './lib/createCancelableTimeout';
import { CancelablePromise } from './lib/CancelablePromise';
import { createFakeCancelable } from './lib/createFakeCancelable';
import { Callbacks } from './lib/Callbacks';
import { createCancelablePromiseFromCallbacks } from './lib/createCancelablePromiseFromCallbacks';
import { copyAndShuffle } from './lib/copyAndShuffle';
import { colorNow } from './logging';
import chalk from 'chalk';

export type HostAndPort = {
  host: string;
  port: number;
};

/**
 * The maximum number of sentinels we try at once when discovering the master.
 */
const maxConcurrentSentinelConnections = 2;

/**
 * Discovers the current master redis instance from the given sentinel instances,
 * trying them in a random order until either all of them have been tried the
 * maximum number of times or a suitable master is found.
 */
export const discoverMasterUsingSentinels = ({
  sentinels,
  minOtherSentinels,
  maxRetries: maxRetriesRaw,
}: {
  /**
   * The sentinel instances to try. They will be tried in a random order to
   * ensure that our performance does not degrade more or less from any particular
   * sentinel being unavailable. We may try multiple sentinels at once in order
   * to speed up discovery, and we may go through them unevenly (however, which
   * ones we are preferencing will be random)
   */
  sentinels: HostAndPort[];

  /**
   * When connecting to the sentinel, before we can use its choice of master, we
   * will verify it's connected to at least this many other sentinels. This
   * avoids a split-brain system, and should almost always be
   * `Math.floor(sentinels.length / 2)`, so e.g., for 3 sentinels (the smallest
   * possible resilient configuration), we ignore a sentinel that doesn't know
   * about any other sentinels.
   */
  minOtherSentinels: number;

  /**
   * The maximum number of times to try each sentinel before giving up entirely.
   * We use exponential backoff in the form (2 ** min(retry, 6)) * 1s, counting
   * independently on each instance. In other words, for a given instance, it
   * will see retries at 0s, 1s, 3s, 7s, 15s, 31s, etc, with the maximum spacer
   * being 64s.
   *
   * We have a connect timeout of 2s and combined read/write timeout of 5s per
   * command (as redis is a simple request/response protocol, this is valid)
   *
   * Can be undefined, in which case we will try each sentinel an infinite number
   * of times. In this case, generally the callee will cancel() the result if it
   * should be aborted.
   */
  maxRetries: number | undefined;
}): CancelablePromise<HostAndPort> => {
  const maxRetries = maxRetriesRaw ?? Infinity;

  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
    cancel = null;
  };

  const promise = new Promise<HostAndPort>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    const cancelers = new Callbacks<undefined>();

    cancel = () => {
      if (done) {
        return;
      }

      done = true;
      cancel = null;
      cancelers.call(undefined);
      reject(new Error('canceled'));
    };

    try {
      await doDiscovery();
    } finally {
      if (!done) {
        fail(new Error('implementation error'));
      }
    }

    function fail(err: Error) {
      if (done) {
        return;
      }

      done = true;
      cancel = null;
      reject(err);
    }

    async function doDiscovery() {
      const shuffledSentinels = copyAndShuffle(sentinels);
      const numAttempts: number[] = new Array(sentinels.length).fill(0);
      const nextRetryTimes: number[] = new Array(sentinels.length).fill(0);
      const currentlyTrying: boolean[] = new Array(sentinels.length).fill(false);
      let running: { idx: number; cancelable: CancelablePromise<HostAndPort> }[] = [];

      const canceled = createCancelablePromiseFromCallbacks(cancelers);

      while (true) {
        if (done) {
          running.forEach((r) => r.cancelable.cancel());
          canceled.cancel();
          return;
        }

        if (running.some((r) => r.cancelable.done())) {
          const newRunning = [];
          for (let i = 0; i < running.length; i++) {
            if (done) {
              break;
            }

            const item = running[i];
            if (!item.cancelable.done()) {
              newRunning.push(item);
              continue;
            }

            currentlyTrying[item.idx] = false;
            try {
              const result = await item.cancelable.promise;
              if (done) {
                continue;
              }
              console.log(
                `${colorNow()} ${chalk.gray(
                  `sentinel ${shuffledSentinels[item.idx].host}:${
                    shuffledSentinels[item.idx].port
                  } found master: ${result.host}:${result.port}`
                )}`
              );

              done = true;
              cancel = null;
              canceled.cancel();
              running.forEach((r) => r.cancelable.cancel());
              resolve(result);
              return;
            } catch (e) {
              console.log(
                `${colorNow()} ${chalk.gray(
                  `sentinel ${shuffledSentinels[item.idx].host}:${
                    shuffledSentinels[item.idx].port
                  } (attempt ${numAttempts[i]}) failed:`
                )}`,
                e
              );
            }
          }
          running = newRunning;
          if (done) {
            continue;
          }
        }

        while (running.length < maxConcurrentSentinelConnections) {
          const curTime = performance.now();
          let foundOneToRun = false;
          for (let i = 0; i < shuffledSentinels.length; i++) {
            if (currentlyTrying[i] || nextRetryTimes[i] > curTime || numAttempts[i] >= maxRetries) {
              continue;
            }

            foundOneToRun = true;
            currentlyTrying[i] = true;
            numAttempts[i]++;
            nextRetryTimes[i] = curTime + 2 ** Math.min(numAttempts[i], 6) * 1000;
            console.log(
              `${colorNow()} ${chalk.gray(
                `attempting sentinel ${shuffledSentinels[i].host}:${shuffledSentinels[i].port} (attempt ${numAttempts[i]})`
              )}`
            );
            running.push({
              idx: i,
              cancelable: discoverMasterUsingSentinel({
                sentinel: shuffledSentinels[i],
                minOtherSentinels,
              }),
            });
            break;
          }
          if (!foundOneToRun) {
            break;
          }
        }

        if (running.length === 0) {
          if (numAttempts.every((n) => n >= maxRetries)) {
            fail(new Error('all sentinel maximum retries exhausted'));
            return;
          }

          const nextAvailableAt = Math.min(...nextRetryTimes);
          const timeUntilNextAvailable = nextAvailableAt - performance.now();
          if (timeUntilNextAvailable > 0) {
            const nextAvailable = createCancelableTimeout(timeUntilNextAvailable);
            try {
              await Promise.race([canceled.promise, nextAvailable.promise]);
            } catch (e) {}

            nextAvailable.cancel();
          }
          continue;
        }

        try {
          await Promise.race([canceled.promise, ...running.map((r) => r.cancelable.promise)]);
        } catch (e) {}
      }
    }
  });

  return {
    done: () => done,
    cancel: () => {
      cancel?.();
    },
    promise,
  };
};

/**
 * Attempts to use the given sentinel to discover the current master redis
 * instance.
 */
const discoverMasterUsingSentinel = ({
  sentinel,
  minOtherSentinels,
}: {
  /**
   * The sentinel instance to try.
   */
  sentinel: HostAndPort;

  /**
   * How many other sentinels this sentinel must be connected to for it
   * to be considered healthy.
   */
  minOtherSentinels: number;
}): CancelablePromise<HostAndPort> => {
  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
  };

  const promise = new Promise<HostAndPort>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    const cancelers = new Callbacks<undefined>();
    cancel = () => {
      if (done) {
        return;
      }

      done = true;
      cancelers.call(undefined);
      reject(new Error('canceled'));
    };

    const client = redis.createClient({
      url: `redis://${sentinel.host}:${sentinel.port}`,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false,
      },
    });
    try {
      await checkMaster();
    } finally {
      if (!done) {
        fail(new Error('implementation error'));
      }
    }

    function fail(err: Error) {
      if (done) {
        return;
      }

      done = true;
      cancel = null;
      client.disconnect().catch(() => {});
      reject(err);
    }

    async function checkMaster() {
      try {
        await client.connect();
      } catch (e) {
        fail(new Error('failed to connect to sentinel'));
        return;
      }

      const commandResult = await sendCommand(['SENTINEL', 'MASTER', 'mymaster']);
      if (done) {
        return;
      }

      // should be an array of strings
      if (!Array.isArray(commandResult)) {
        fail(new Error('command returned invalid result'));
        return;
      }

      let ip: string | undefined = undefined;
      let port: number | undefined = undefined;
      let numOtherSentinels: number | undefined = undefined;

      for (let i = 0; i < commandResult.length - 1; i += 2) {
        const key = commandResult[i];
        if (typeof key !== 'string') {
          fail(new Error('command returned invalid result'));
          return;
        }

        const val = commandResult[i + 1];
        if (typeof val !== 'string') {
          fail(new Error('command returned invalid result'));
          return;
        }

        switch (key) {
          case 'ip':
            ip = val;
            break;
          case 'port':
            try {
              port = parseInt(val, 10);
            } catch (e) {
              fail(new Error('command returned invalid port'));
              return;
            }
            break;
          case 'num-other-sentinels':
            try {
              numOtherSentinels = parseInt(val, 10);
            } catch (e) {
              fail(new Error('command returned invalid num-other-sentinels'));
              return;
            }
            break;
        }
      }

      if (ip === undefined || port === undefined || numOtherSentinels === undefined) {
        fail(new Error('command returned invalid result'));
        return;
      }

      if (numOtherSentinels < minOtherSentinels) {
        fail(new Error('sentinel is not connected to enough other sentinels'));
        return;
      }

      done = true;
      cancel = null;
      client.quit().catch(() => {
        client.disconnect().catch(() => {});
      });
      resolve({ host: ip, port });
    }

    async function sendCommand(cmd: string[]) {
      const canceled = createCancelablePromiseFromCallbacks(cancelers);
      const commandTimeout = createCancelableTimeout(5000);
      const command = createFakeCancelable(() => client.sendCommand(cmd));

      try {
        await Promise.race([canceled.promise, commandTimeout.promise, command.promise]);
      } catch (err) {
        // we'll handle this below if it's on the command, otherwise it
        // doesn't matter
      }

      if (done) {
        // we were canceled, doesn't matter what happened
        return;
      }

      if (command.done()) {
        canceled.cancel();
        commandTimeout.cancel();
        try {
          const commandResult = await command.promise;
          if (done) {
            return;
          }
          return commandResult;
        } catch (e) {
          fail(new Error('command failed'));
          return;
        }
      } else {
        // timeout

        canceled.cancel();
        command.cancel();
        commandTimeout.cancel();

        fail(new Error('command timed out'));
        return;
      }
    }
  });

  return {
    done: () => done,
    cancel: () => {
      cancel?.();
    },
    promise,
  };
};

/**
 * Subscribes to the given channel, waits for one message, and then
 * resolves with that message. Unlike the standard method of doing this,
 * this is fully cancelable.
 *
 * Note this should not be used in a tight loop as it can easily miss messages.
 * It's intended for when waiting for a rare particular signal, e.g., to restart
 * the instance. This implementation can be adapted to be more suitable for
 * continuous listening, but would require a message callback or multiple function
 * calls.
 *
 * @returns The message received
 */
export const subscribeForOneMessage = ({
  client,
  channel,
}: {
  /**
   * The client whose settings to copy. An identical client will be created
   * and connected for the duration of the promise.
   */
  client: ReturnType<typeof redis.createClient>;
  /**
   * The channel to listen for a message on
   */
  channel: string;
}): CancelablePromise<string> => {
  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
  };
  const promise = new Promise<string>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    let tentativelyDone = false;

    const cancelers = new Callbacks<undefined>();
    cancel = () => {
      if (tentativelyDone) {
        return;
      }

      cancelers.call(undefined);
    };

    const canceled = createCancelablePromiseFromCallbacks(cancelers);

    const subscriber = client.duplicate();
    cancelers.add(() => {
      subscriber.quit().catch(() => {
        subscriber.disconnect().catch(() => {});
      });

      if (!tentativelyDone) {
        tentativelyDone = true;
        reject(new Error('canceled'));
      }
    });

    try {
      await Promise.race([canceled.promise, subscriber.connect()]);
    } catch (e) {
      if (tentativelyDone) {
        return;
      }

      tentativelyDone = true;
      cancelers.call(undefined);
      reject(e);
      return;
    }

    subscriber.on('error', (e) => {
      if (tentativelyDone) {
        console.info(`${colorNow()} ${chalk.gray(`Unsubscribing from redis channel ${channel}`)}`);
        return;
      }

      console.info(`${colorNow()} ${chalk.red(`Unsubscribing from redis channel ${channel}`)}`, e);
      tentativelyDone = true;
      cancelers.call(undefined);
      reject(e);
    });

    console.info(`${colorNow()} ${chalk.gray(`Subscribing to redis channel ${channel}`)}`);
    subscriber.subscribe(channel, (msg) => {
      console.log('received msg:', msg);
      if (tentativelyDone) {
        return;
      }

      tentativelyDone = true;
      cancelers.call(undefined);
      resolve(msg);
    });
  }).finally(() => {
    done = true;
  });

  return {
    done: () => done,
    cancel: () => {
      cancel?.();
    },
    promise,
  };
};
