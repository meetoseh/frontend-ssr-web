import { CancelablePromise } from './CancelablePromise';

/**
 * Creates a cancelable promise that resolves after a given duration in milliseconds.
 *
 * @param duration The duration in milliseconds.
 * @returns A cancelable promise.
 */
export const createCancelableTimeout = (duration: number): CancelablePromise<undefined> => {
  let instaCanceled = false;
  let cancel: (() => void) | null = () => {
    instaCanceled = true;
  };
  const promise = new Promise<undefined>((resolve, reject) => {
    if (instaCanceled) {
      cancel = null;
      reject(new Error('canceled'));
      return;
    }

    const timeout = setTimeout(() => {
      cancel = null;
      resolve(undefined);
    }, duration);

    cancel = () => {
      cancel = null;
      clearTimeout(timeout);
      reject(new Error('Canceled'));
    };
  });

  return {
    promise,
    done: () => cancel === null,
    cancel: () => {
      cancel?.();
    },
  };
};
