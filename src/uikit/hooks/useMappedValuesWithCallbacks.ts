import { MutableRefObject, useEffect, useRef } from 'react';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { MappedValueWithCallbacksOpts, defaultEqualityFn } from './useMappedValueWithCallbacks';

/**
 * Similar to useMappedValueWithCallbacks, except this one maps an array of
 * values to a single value, rather than a single value to a single value.
 *
 * This never triggers react rerenders.
 *
 * TypeScript can have trouble determining the type of V in some situations;
 * when this happens, it's generally simplest to not use the argument to
 * mapper and instead reference the array directly, since get() is presumably
 * "free".
 *
 * @param arr The array of values, where each element is specified as an independent
 *   ValueWithCallbacks.
 * @param mapper The function which creates the mapped value given the unwrapped
 *   array of values.
 * @param rawOpts Additional options while mapping
 * @returns The mapped value, wrapped in a ValueWithCallbacks.
 */
export const useMappedValuesWithCallbacks = <V, T extends ValueWithCallbacks<V>[], U>(
  arr: T,
  mapper: (arr: V[]) => U,
  rawOpts?: MappedValueWithCallbacksOpts<V[], U>
) => {
  const opts: Required<MappedValueWithCallbacksOpts<V[], U>> = Object.assign(
    {
      inputEqualityFn: defaultEqualityFn,
      outputEqualityFn: defaultEqualityFn,
    },
    rawOpts
  );
  const lastInputRef = useRef<V[]>() as MutableRefObject<V[]>;
  if (lastInputRef.current === undefined) {
    lastInputRef.current = arr.map((a) => a.get());
  }
  const result = useWritableValueWithCallbacks<U>(() => mapper(lastInputRef.current));

  useEffect(() => {
    for (const v of arr) {
      v.callbacks.add(handleChange);
    }
    handleChange();
    return () => {
      for (const v of arr) {
        v.callbacks.remove(handleChange);
      }
    };

    function handleChange() {
      const newInput = arr.map((a) => a.get());
      if (opts.inputEqualityFn.call(undefined, lastInputRef.current, newInput)) {
        return;
      }

      const newOutput = mapper(newInput);
      if (opts.outputEqualityFn.call(undefined, result.get(), newOutput)) {
        return;
      }

      lastInputRef.current = newInput;
      result.set(newOutput);
      result.callbacks.call(undefined);
    }
  }, [arr, mapper, result, opts.inputEqualityFn, opts.outputEqualityFn]);

  return result;
};
