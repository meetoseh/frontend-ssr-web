import { CancelablePromise } from './CancelablePromise';
import { constructCancelablePromise } from './CancelablePromiseConstructor';
import { OrderedDictionary } from './OrderedDictionary';
import { createCancelablePromiseFromCallbacks } from './createCancelablePromiseFromCallbacks';

export type AsyncLock = {
  acquire: () => CancelablePromise<void>;
  release: () => void;
  runWithLock: <T>(fn: () => CancelablePromise<T>) => CancelablePromise<T>;
  runSyncWithLock: <T>(fn: () => T) => CancelablePromise<T>;
};

export const createLock = (): AsyncLock => {
  let locked = false;
  let nextId = 0;
  const queue: OrderedDictionary<{ cb: () => void; id: number }, 'cb', 'id'> =
    new OrderedDictionary('cb', 'id');

  const me: AsyncLock = {
    acquire(): CancelablePromise<void> {
      return constructCancelablePromise({
        body: async (state, resolve, reject) => {
          if (state.finishing) {
            state.done = true;
            reject(new Error('canceled'));
            return;
          }

          if (!locked) {
            locked = true;
            state.finishing = true;
            state.done = true;
            resolve();
            return;
          }

          const id = ++nextId;
          let done = false;
          const onReady = () => {
            if (done) {
              return;
            }
            state.finishing = true;
            state.done = true;
            resolve();
          };

          state.cancelers.add(() => {
            if (done) {
              return;
            }
            done = true;
            queue.delete(onReady);

            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
          });
          queue.push({ cb: onReady, id });
        },
      });
    },
    release(): void {
      if (!locked) {
        throw new Error('Cannot release lock when not locked');
      }

      const nextInQueue = queue.shift();
      if (nextInQueue === undefined) {
        locked = false;
        return;
      }

      nextInQueue.cb();
    },
    runWithLock(fn) {
      return constructCancelablePromise({
        body: async (state, resolve, reject) => {
          const canceled = createCancelablePromiseFromCallbacks(state.cancelers);

          if (state.finishing) {
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          const acquire = me.acquire();
          try {
            await Promise.race([canceled.promise, acquire.promise]);
          } catch (e) {}

          if (!acquire.done()) {
            acquire.cancel();
            state.finishing = true;
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          if (state.finishing) {
            me.release();
            if (!state.done) {
              state.done = true;
              reject(new Error('canceled'));
            }
            return;
          }

          const inner = fn();
          try {
            await Promise.race([canceled.promise, inner.promise]);
          } catch (e) {}

          if (!inner.done()) {
            inner.cancel();
          }
          await Promise.allSettled([inner.promise]);
          me.release();

          state.finishing = true;
          state.done = true;
          try {
            resolve(await inner.promise);
          } catch (e) {
            reject(e);
          }
        },
      });
    },
    runSyncWithLock(fn) {
      return me.runWithLock(() =>
        constructCancelablePromise({
          body: async (state, resolve, reject) => {
            if (state.finishing) {
              if (!state.done) {
                state.done = true;
                reject(new Error('canceled'));
              }
              return;
            }

            try {
              const result = fn();
              state.finishing = true;
              state.done = true;
              resolve(result);
            } catch (e) {
              state.finishing = true;
              state.done = true;
              reject(e);
            }
          },
        })
      );
    },
  };
  return me;
};
