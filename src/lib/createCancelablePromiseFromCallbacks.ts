import { Callbacks } from './Callbacks';
import { CancelablePromise } from './CancelablePromise';

/**
 * Creates a cancelable promise from a Callbacks object. The promise resolves when
 * the callbacks are called.
 *
 * @param callbacks the callbacks to wait for
 * @returns a cancelable promise
 */
export function createCancelablePromiseFromCallbacks<T>(
  callbacks: Callbacks<T>
): CancelablePromise<T> {
  let instaCanceled = false;
  let cancel: (() => void) | null = () => {
    instaCanceled = true;
  };
  const promise = new Promise<T>((resolve, reject) => {
    if (instaCanceled) {
      cancel = null;
      reject(new Error('canceled'));
      return;
    }

    const handler = (event: T) => {
      if (cancel === null) {
        return;
      }
      cancel = null;
      callbacks.remove(handler);
      resolve(event);
    };
    cancel = () => {
      cancel = null;
      callbacks.remove(handler);
      reject(new Error('Canceled'));
    };
    callbacks.add(handler);
  });
  return {
    cancel: () => {
      cancel?.();
    },
    done: () => cancel === null,
    promise,
  };
}
