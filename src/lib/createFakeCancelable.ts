import { CancelablePromise } from './CancelablePromise';

/**
 * Adds cancelable functionality to the given promise, without actually stopping
 * the underlying operation when canceled. Since this doesn't actually release
 * any resources, it can give the misleading appearance of resources being
 * cleaned up when they are not.
 *
 * The main advantage of fake cancelables is that adding true cancelable
 * functionality later is much easier if the caller is already using the
 * cancelable pattern.
 *
 * @param underlying The promise to wrap
 * @returns The same promise, but with cancelable functionality. The promise
 *   will error canceled if canceled, even though the underlying operation
 *   will continue.
 */
export const createFakeCancelable = <T>(underlying: () => Promise<T>): CancelablePromise<T> => {
  let instaCanceled = false;
  let finished = false;
  let cancel: (() => void) | null = () => {
    instaCanceled = true;
    cancel = null;
  };

  const promise = new Promise<T>((resolve, reject) => {
    if (instaCanceled) {
      finished = true;
      reject(new Error('canceled'));
      return;
    }

    cancel = () => {
      if (finished) {
        return;
      }
      finished = true;
      cancel = null;
      reject(new Error('canceled'));
    };

    underlying()
      .then((value) => {
        if (finished) {
          return;
        }
        finished = true;
        cancel = null;
        resolve(value);
      })
      .catch((e) => {
        if (finished) {
          return;
        }
        finished = true;
        cancel = null;
        reject(e);
      });
  });

  return {
    done: () => finished,
    cancel: () => {
      cancel?.();
    },
    promise,
  };
};
