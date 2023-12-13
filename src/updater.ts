import * as fs from 'fs';
import { CancelablePromise } from './lib/CancelablePromise';
import { Callbacks } from './lib/Callbacks';
import chalk from 'chalk';
import { createCancelablePromiseFromCallbacks } from './lib/createCancelablePromiseFromCallbacks';
import { createCancelableTimeout } from './lib/createCancelableTimeout';
import { colorNow } from './logging';
import { HostAndPort, discoverMasterUsingSentinels, subscribeForOneMessage } from './redis';
import redis from 'redis';
import { spawn } from 'child_process';
import * as crypto from 'crypto';

export function handleUpdates(onReady: () => void): CancelablePromise<void> {
  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
    cancel = null;
  };

  const promise = new Promise<void>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    const cancelers = new Callbacks<undefined>();
    let doneTentatively = false;
    cancel = () => {
      if (doneTentatively) {
        return;
      }

      doneTentatively = true;
      cancelers.call(undefined);
      cancel = null;
    };

    createLockFileSync();

    try {
      const canceled = createCancelablePromiseFromCallbacks(cancelers);
      const updateLockReleased = releaseUpdateLockIfHeld();
      cancelers.add(updateLockReleased.cancel);
      await Promise.race([canceled.promise, updateLockReleased.promise]);
      if (doneTentatively) {
        return;
      }
      canceled.cancel();
      updateLockReleased.cancel();
      onReady();
      await handle();
    } catch (e) {
      console.error(e);
    } finally {
      fs.unlinkSync('updater.lock');
      done = true;
      reject(new Error('canceled'));
    }

    async function raceCancelable<T>(
      canceled: CancelablePromise<void>,
      ...others: CancelablePromise<T>[]
    ) {
      for (const other of others) {
        cancelers.add(other.cancel);
      }
      await Promise.race([canceled.promise, ...others.map((other) => other.promise)]);
      if (doneTentatively) {
        return;
      }
      for (const other of others) {
        cancelers.remove(other.cancel);
      }
    }

    async function handleInner(canceled: CancelablePromise<void>) {
      const redisInstances = getRedisSentinels();
      const cancelableMasterPromise = discoverMasterUsingSentinels({
        sentinels: redisInstances,
        minOtherSentinels: Math.floor(redisInstances.length / 2),
        maxRetries: undefined,
      });
      await raceCancelable(canceled, cancelableMasterPromise);
      if (doneTentatively) {
        return;
      }
      const master = await cancelableMasterPromise.promise;

      const client = redis.createClient({
        url: `redis://${master.host}:${master.port}`,
        socket: {
          connectTimeout: 2000,
          reconnectStrategy: false,
        },
      });

      try {
        const messageCancelable = subscribeForOneMessage({
          client,
          channel: 'updates:frontend-ssr-web',
        });
        await raceCancelable(canceled, messageCancelable);
        if (doneTentatively) {
          return;
        }

        const message = await messageCancelable.promise;
        console.log(`${colorNow()} ${chalk.whiteBright(`updater received signal: ${message}`)}`);

        console.log(
          `${colorNow()} ${chalk.gray('waiting a few seconds for github to cache the update...')}`
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log(`${colorNow()} ${chalk.gray('acquiring update lock...')}`);

        try {
          const acquireLockCancelable = acquireUpdateLock();
          await raceCancelable(canceled, acquireLockCancelable);
          // we ignore doneTentatively at this point: we will proceed with the update regardless.
          // we race so that the acquire lock gets canceled if we have received sigint already
          await acquireLockCancelable.promise;
        } catch (e) {
          console.log(
            `${colorNow()} ${chalk.red(
              'updater failed to acquire updater lock; proceeding without lock'
            )}`
          );
        }

        await doUpdate();
        doneTentatively = true;
      } finally {
        client.quit().catch(() => {
          client.disconnect().catch(() => {});
        });
      }
    }

    async function handle() {
      const canceled = createCancelablePromiseFromCallbacks(cancelers);
      while (!doneTentatively) {
        try {
          await handleInner(canceled);
        } catch (e) {
          if (doneTentatively) {
            break;
          }

          console.warn(
            `${colorNow()} ${chalk.redBright(
              'handleUpdates encountered an error; this usually indicates a redis failover. Retrying in 4s'
            )}`,
            e
          );

          const timeout = createCancelableTimeout(4000);
          await Promise.race([canceled.promise, timeout.promise]).catch(() => {});
          timeout.cancel();
        }
      }

      canceled.cancel();
      console.info(`${colorNow()} ${chalk.gray('updater shutting down')}`);
    }

    function createLockFileSync() {
      try {
        fs.writeFileSync('updater.lock', process.pid.toString(), {
          flag: 'wx',
        });
      } catch (e) {
        console.error(`${colorNow()} ${chalk.redBright('unable to create lock file')}`, e);
        process.exit(1);
      }
    }

    async function doUpdate() {
      if (process.platform === 'win32') {
        console.warn(
          `${colorNow()} ${chalk.redBright(
            'doUpdate not implemented on windows: restart manually'
          )}`
        );
        process.emit('SIGINT');
        return;
      }

      let updaterScript = '/home/ec2-user/update_webapp.sh';
      spawn(`bash ${updaterScript}`, {
        shell: true,
        detached: true,
      });
    }
  });

  return {
    done: () => done,
    cancel: () => {
      cancel?.();
    },
    promise,
  };
}

function getRedisSentinels(): HostAndPort[] {
  const redisInstancesRaw = process.env.REDIS_IPS?.split(',');
  if (redisInstancesRaw === undefined || redisInstancesRaw.length === 0) {
    console.error(`${colorNow()} ${chalk.redBright('REDIS_IPS not set')}`);
    process.exit(1);
  }
  return redisInstancesRaw.map((ip) => ip.trim()).map((ip) => ({ host: ip, port: 26379 }));
}

function releaseUpdateLockIfHeld(): CancelablePromise<void> {
  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
  };
  const promise = new Promise<void>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    let ourIdentifier: string | null = null;
    try {
      ourIdentifier = fs.readFileSync('updater-lock-key.txt', {
        encoding: 'utf8',
      });
    } catch (e) {
      // we don't hold the lock
      resolve();
      return;
    }

    let doneTentatively = false;
    const cancelers = new Callbacks<undefined>();
    cancel = () => {
      cancel = null;
      if (doneTentatively) {
        return;
      }

      cancelers.call(undefined);
    };

    const canceled = createCancelablePromiseFromCallbacks(cancelers);
    const sentinels = getRedisSentinels();
    const masterCancelable = discoverMasterUsingSentinels({
      sentinels,
      minOtherSentinels: Math.floor(sentinels.length / 2),
      maxRetries: undefined,
    });

    cancelers.add(masterCancelable.cancel);

    try {
      await Promise.race([canceled.promise, masterCancelable]);
    } catch (e) {}

    if (doneTentatively) {
      return;
    }

    cancelers.remove(masterCancelable.cancel);
    const master = await masterCancelable.promise;

    const client = redis.createClient({
      url: `redis://${master.host}:${master.port}`,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false,
      },
    });

    cancelers.add(() => {
      client.quit().catch(() => {
        client.disconnect().catch(() => {});
      });
    });

    try {
      await Promise.race([canceled.promise, client.connect()]);
    } catch (e) {
      if (!doneTentatively) {
        doneTentatively = true;
        cancelers.call(undefined);
        reject(e);
        return;
      }
    }

    if (doneTentatively) {
      return;
    }

    const commandPromise = client.eval(DELETE_IF_MATCH_SCRIPT, {
      keys: ['updates:frontend-ssr-web:lock'],
      arguments: [ourIdentifier],
    });

    try {
      await Promise.race([canceled.promise, commandPromise]);
    } catch (e) {
      if (!doneTentatively) {
        doneTentatively = true;
        cancelers.call(undefined);
        reject(e);
        return;
      }
    }

    if (doneTentatively) {
      return;
    }

    const commandResult = await commandPromise;

    try {
      fs.unlinkSync('updater-lock-key.txt');
    } catch (e) {
      console.warn(
        `${colorNow()} ${chalk.redBright('updater unable to delete updater-lock-key.txt')}`,
        e
      );
    }

    if (commandResult === '1' || commandResult === 1) {
      console.info(`${colorNow()} ${chalk.white('updater successfully released update lock')}`);
    } else {
      console.log(
        `${colorNow()} ${chalk.red(
          `updater lock was stolen, breaking 1-by-1 deployment (expected identifier ${ourIdentifier})`
        )}`
      );
    }
    doneTentatively = true;
    cancelers.call(undefined);
    resolve();
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
}

function acquireUpdateLock(): CancelablePromise<void> {
  let done = false;
  let cancel: (() => void) | null = () => {
    done = true;
  };
  const promise = new Promise<void>(async (resolve, reject) => {
    if (done) {
      reject(new Error('canceled'));
      return;
    }

    let doneTentatively = false;
    const cancelers = new Callbacks<undefined>();
    cancel = () => {
      cancel = null;
      if (doneTentatively) {
        return;
      }

      cancelers.call(undefined);
    };

    const canceled = createCancelablePromiseFromCallbacks(cancelers);
    const sentinels = getRedisSentinels();
    const masterCancelable = discoverMasterUsingSentinels({
      sentinels,
      minOtherSentinels: Math.floor(sentinels.length / 2),
      maxRetries: undefined,
    });

    cancelers.add(masterCancelable.cancel);

    try {
      await Promise.race([canceled.promise, masterCancelable]);
    } catch (e) {}

    if (doneTentatively) {
      return;
    }

    cancelers.remove(masterCancelable.cancel);
    const master = await masterCancelable.promise;

    const client = redis.createClient({
      url: `redis://${master.host}:${master.port}`,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false,
      },
    });

    cancelers.add(() => {
      client.quit().catch(() => {
        client.disconnect().catch(() => {});
      });
    });

    try {
      await Promise.race([canceled.promise, client.connect()]);
    } catch (e) {
      if (!doneTentatively) {
        doneTentatively = true;
        cancelers.call(undefined);
        reject(e);
        return;
      }
    }

    if (doneTentatively) {
      return;
    }

    const ourIdentifier = crypto.randomBytes(16).toString('base64url');

    while (!doneTentatively) {
      try {
        fs.writeFileSync('updater-lock-key.txt', ourIdentifier);
      } catch (e) {
        if (!doneTentatively) {
          doneTentatively = true;
          cancelers.call(undefined);
          reject(e);
          return;
        }
      }

      const commandPromise = client.set('updates:frontend-ssr-web:lock', ourIdentifier, {
        NX: true,
        EX: 300,
      });

      try {
        await Promise.race([canceled.promise, commandPromise]);
      } catch (e) {
        if (!doneTentatively) {
          doneTentatively = true;
          cancelers.call(undefined);
          reject(e);
          return;
        }
      }
      if (doneTentatively) {
        return;
      }

      const result = await commandPromise;
      if (result === 'OK') {
        console.info(
          `${colorNow()} ${chalk.white(
            `update successfully acquired update lock; identifier=${ourIdentifier}`
          )}`
        );
        doneTentatively = true;
        client.quit().catch(() => {
          client.disconnect().catch(() => {});
        });
        resolve();
        return;
      }

      console.log(
        `${colorNow()} ${chalk.gray(
          `updater: lock still held (result=${result}), retrying in 1s...`
        )}`
      );

      const timeoutCancelable = createCancelableTimeout(1000);
      cancelers.add(timeoutCancelable.cancel);
      try {
        await Promise.race([timeoutCancelable.promise, canceled.promise]);
      } catch (e) {
        if (!doneTentatively) {
          doneTentatively = true;
          cancelers.call(undefined);
          reject(e);
          return;
        }
      }

      if (doneTentatively) {
        return;
      }
      cancelers.remove(timeoutCancelable.cancel);
    }
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
}

const DELETE_IF_MATCH_SCRIPT = `
local key = KEYS[1]
local expected = ARGV[1]

local current = redis.call("GET", key)
if current == expected then
    redis.call("DEL", key)
    return 1
end
return 0
`;
