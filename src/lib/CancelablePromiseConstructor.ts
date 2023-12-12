import { Callbacks } from './Callbacks';
import { CancelablePromise } from './CancelablePromise';

/**
 * A constructed cancelable promise is a specific type of cancelable
 * promise implementation, meant to facilitate helper functions that
 * take over the logic of the promise.
 *
 * This essentially lifts the bound variables in the following implementation:
 *
 * ```ts
 * const createMyCancelablePromise = (): CancelablePromise<void> => {
 *   let done = false;
 *   let finishing = false;
 *   let rejectCanceled: (() => void) | undefined = undefined;
 *   const cancelers = new Callbacks<undefined>();
 *
 *   // <preamble>
 *
 *   return {
 *     done: () => done,
 *     cancel: () => {
 *       if (!finishing) {
 *        finishing = true;
 *        cancelers.call(undefined);
 *        rejectCanceled?.();
 *       }
 *     },
 *     promise: new Promise((resolve, reject) => {
 *       if (finishing) {
 *         reject(new Error('canceled'));
 *         return;
 *       }
 *        rejectCanceled = () => reject(new Error('canceled'))
 *
 *       // <body>, which should eventually call resolve or reject
 *     }).finally(() => { done = true; })
 *   }
 * }
 * ```
 *
 * which would then become
 *
 * ```ts
 * const createMyCancelablePromise = (): CancelablePromise<void> => constructCancelablePromise({
 *   preamble: (state) => {
 *     // state is holding the locals you need, e.g., done, finishing, cancelers
 *   },
 *   body: (state, resolve, reject) => {
 *     // state is holding the locals you need, e.g., done, finishing, cancelers
 *   }
 * })
 * ```
 *
 * Now this allow for helper functions that take over parts (or the entirety) of
 * the preamble or body, without the extensive documentation required to explain
 * what they are allowed to do and how to call them which is more clearly
 * expressed by using a shared implementation which can be referenced
 * (constructCancelablePromise).
 *
 * As can be seen in the above example, the constructor is rarely ever exposed,
 * and thus its existence is primarily to facilitate doucmentation (by means of
 * ensuring implementation consistency)
 */
type CancelablePromiseConstructor<T> = {
  /**
   * Run immediately, before javascript execution is yielded. Should be used for error-checking
   * arguments and other pre-flight checks to ensure the error is bubbled as quickly as possible,
   * but otherwise can be omitted.
   *
   * @param state The standard cancelable promise state
   * @returns void
   */
  preamble?: (state: CancelablePromiseState) => void;

  /**
   * The body for the cancelable promise, which must eventually call `resolve` or `reject`.
   * Should stop its execution immediately if the promise is canceled, which can be identified
   * by polling with `state.finishing`, and listened for via `state.cancelers`.
   *
   * This is usually async for convenience, but it is never awaited since it's sufficient
   * to detect that resolve/reject was called.
   *
   * @param state The standard cancelable promise state
   * @param resolve The standard promise resolve function
   * @param reject The standard promise reject function
   */
  body: (
    state: CancelablePromiseState,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void
  ) => void;
};

/**
 * The standard state for a cancelable promise when using the
 * `constructCancelablePromise` function.
 */
export type CancelablePromiseState = {
  /**
   * If the promise has already resolved or rejected, such that its
   * finally() callback has been called. You do not typically need
   * to check this value
   */
  done: boolean;
  /**
   * If the promise is cleaning up, i.e., we've decided whether or not
   * we're going to resolve and reject and with what, and we either already
   * have or we're waiting for the cancelers to finish and then will do
   * so immediately after
   */
  finishing: boolean;
  /**
   * Invoked just after setting finishing to true but before resolving or
   * rejecting the promises. This should be used to cancel any ongoing
   * operations. This being invoked does not necessarily mean the promise
   * was canceled, although that's the scenario that you can't control
   * the timing of and is generally the most complicated to handle.
   */
  cancelers: Callbacks<undefined>;
};

/**
 * A convenience type for the arguments to the body of a cancelable promise,
 * so that they can be accepted by helpers
 */
export type CancelablePromiseBodyArgs<T> = {
  state: CancelablePromiseState;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

/**
 * Constructs a cancelable promise from a cancelable promise constructor.
 *
 * @param constructor The cancelable promise constructor
 * @returns The cancelable promise
 */
export const constructCancelablePromise = <T>(
  constructor: CancelablePromiseConstructor<T>
): CancelablePromise<T> => {
  const state = {
    done: false,
    finishing: false,
    cancelers: new Callbacks<undefined>(),
  };
  let rejectCanceled: (() => void) | undefined = undefined;

  constructor.preamble?.(state);

  return {
    done: () => state.done,
    cancel: () => {
      if (!state.finishing) {
        state.finishing = true;
        state.cancelers.call(undefined);
        rejectCanceled?.();
      }
    },
    promise: new Promise<T>((resolve, reject) => {
      if (state.finishing) {
        reject(new Error('canceled'));
        return;
      }

      rejectCanceled = () => reject(new Error('canceled'));
      constructor.body(state, resolve, reject);
    }),
  };
};
