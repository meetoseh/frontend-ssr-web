/**
 * Describes a promise which can be canceled early.
 */
export type CancelablePromise<T> = {
  /** The promise, which may have some resources bound until it's resolved/canceled */
  promise: Promise<T>;
  /** True if the promise finished (either resolved or rejected) */
  done: () => boolean;
  /** A function to call if the promise is not done that will cause the promise to be rejected */
  cancel: () => void;
};
