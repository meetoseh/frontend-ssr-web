import chalk from 'chalk';
import { Callbacks } from './Callbacks';
import { CancelablePromise } from './CancelablePromise';
import { inspect } from 'util';
import { colorNow } from '../logging';

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
  ) => undefined | { finally: (onfinally: () => void) => void };

  /**
   * If set to true, then the body will be wrapped in a try/finally block
   * which will reject the promise if the body returns before calling
   * resolve or reject. Defaults to false, in which case an error will
   * be thrown if the body returns before calling resolve or reject in
   * dev mode, and the promise will be rejected in prod mode.
   *
   * This should only be set when prototyping, as how done() works is
   * very subtle, and setting done explicitly makes it more clear how
   * it works
   */
  guardBody?: boolean;
};

/**
 * The standard state for a cancelable promise when using the
 * `constructCancelablePromise` function.
 */
export type CancelablePromiseState = {
  /**
   * Starts false and is set to true immediately before calling resolve() or reject().
   *
   * This means that awaiting the promise will queue the callback to be run as soon
   * as possible. In other words:
   *
   * ```ts
   * if (cancelable.done()) {
   *   console.log("A")
   *   await cancelable.promise;
   *   console.log("B")
   * }
   * ```
   *
   * between A and B control was yielded to the event loop, so there may be other
   * code that runs in between, but continuation will occur as soon as CPU time
   * is available, rather than e.g. waiting on network IO.
   *
   * In other words, the following should have the same characteristics:
   *
   * ```ts
   * // 1, assuming cancelable.done()
   * console.log('A');
   * cancelable.promise.finally(() => {
   *   console.log('B');
   * });
   *
   * // 2
   * console.log('A');
   * setImmediate(() => {
   *   console.log('B');
   * });
   * ```
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

      let bodyResolvedOrRejected = false;
      const ensureDone = () => {
        if (!state.done) {
          console.trace(
            `${colorNow()}: ${chalk.redBright(
              'body called resolve() without setting state.done'
            )}: ${chalk.white(inspect(constructor))}`
          );

          state.done = true;
          if (process.env.ENVIRONMENT === 'dev') {
            reject(new Error('body called resolve() or reject() without setting state.done'));
          }
          return;
        }
      };

      const wrappedResolve = (v: T | PromiseLike<T>) => {
        ensureDone();
        bodyResolvedOrRejected = true;
        resolve(v);
      };

      const wrappedReject = (e: any) => {
        ensureDone();
        bodyResolvedOrRejected = true;
        reject(e);
      };

      let handledCleanup = false;
      const cleanup = () => {
        if (handledCleanup) {
          return;
        }
        handledCleanup = true;

        if (bodyResolvedOrRejected) {
          return;
        }

        if (constructor.guardBody) {
          wrappedReject(new Error('body returned without resolving or rejecting'));
        } else {
          console.log(
            `${colorNow()}: ${chalk.redBright(
              'body returned without resolving or rejecting'
            )}: ${chalk.white(inspect(constructor))}`
          );

          if (process.env.ENVIRONMENT === 'dev') {
            throw new Error('body returned without resolving or rejecting');
          } else {
            wrappedReject(new Error('body returned without resolving or rejecting'));
          }
        }
      };

      let hadPromise = false;
      try {
        const result = constructor.body(state, wrappedResolve, wrappedReject);
        if (result !== undefined) {
          hadPromise = true;
          result.finally(cleanup);
        }
      } finally {
        if (!hadPromise) {
          cleanup();
        }
      }
    }),
  };
};
