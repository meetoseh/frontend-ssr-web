import { useEffect } from 'react';
import { useWritableValueWithCallbacks } from '../lib/Callbacks';

/**
 * A convenience function for upgrading a react managed value to a value with
 * callbacks. This is generally just an adapter function as theres no advantage
 * to doing this over just using the react managed value directly: every time
 * the callbacks is called it must have been triggered by a react rerender,
 * so there are no savings to be had.
 *
 * @param value The react managed value
 * @param equalityFn The equality function to use to determine if the value has changed
 * @returns The value with callbacks whose current value reflects the specified value.
 *   Updates after rendering.
 */
export const useReactManagedValueAsValueWithCallbacks = <T>(
  value: T,
  equalityFn: (a: T, b: T) => boolean = Object.is
) => {
  const result = useWritableValueWithCallbacks<T>(() => value);

  useEffect(() => {
    if (!equalityFn(result.get(), value)) {
      result.set(value);
      result.callbacks.call(undefined);
    }
  }, [result, value, equalityFn]);

  return result;
};
