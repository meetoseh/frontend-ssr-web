import { ValueWithCallbacks } from '../lib/Callbacks';
import {
  MappedValueWithCallbacksOpts,
  useMappedValueWithCallbacks,
} from './useMappedValueWithCallbacks';
import { useValueWithCallbacksEffect } from './useValueWithCallbacksEffect';

/**
 * A convenience hook for mapping a value with callbacks to a new value and
 * using that new value as an effect function.
 *
 * For example,
 *
 * ```ts
 * const number = useWritableValueWithCallbacks(() => 3);
 *
 * // effect that runs when the number is positive vs negative
 * useMappedValueWithCallbacksEffect(
 *   number,
 *   (v) => v >= 0,
 *   (isNonNegative) => {
 *     console.log('isNonNegative', isNonNegative);
 *     return undefined;
 *   }
 * );
 * ```
 *
 * @param original The original value with callbacks.
 * @param mapper The function to map the value to a new value. According
 *   to the mapper options, which behave just like `useMappedValueWithCallbacks`,
 *   not all changes to the original may be interpreted as new mapped values
 * @param effect The effect function to run when the mapped value changes.
 * @param mapperOpts The options to use when mapping the value.
 */
export const useMappedValueWithCallbacksEffect = <T, U>(
  original: ValueWithCallbacks<T>,
  mapper: (value: T) => U,
  effect: (value: U) => (() => void) | undefined,
  mapperOpts?: MappedValueWithCallbacksOpts<T, U>
): void => {
  const mapped = useMappedValueWithCallbacks(original, mapper, mapperOpts);
  useValueWithCallbacksEffect(mapped, effect);
};
