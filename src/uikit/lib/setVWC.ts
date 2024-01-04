import { defaultEqualityFn } from '../hooks/useMappedValueWithCallbacks';
import { WritableValueWithCallbacks } from './Callbacks';

/**
 * Sets the value of a WritableValueWithCallbacks object if it differs
 * from the current value based on the given equality function. Uses the
 * default equality function from mapped value with callbacks if none is
 * provided.
 *
 * @param vwc The value with callbacks to set.
 * @param value The value to set.
 * @param equalityFn The equality function to use, or undefined to use the default,
 *   which is a very safe equality function (only true if there were definitely
 *   no changes, not even mutations, because it's always false for mutable values).
 */
export function setVWC<T>(
  vwc: WritableValueWithCallbacks<T>,
  value: T,
  equalityFn?: (a: T, b: T) => boolean
): void {
  equalityFn = equalityFn ?? defaultEqualityFn;
  if (!equalityFn(vwc.get(), value)) {
    vwc.set(value);
    vwc.callbacks.call(undefined);
  }
}
