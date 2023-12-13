import { useCallback, useEffect, useRef } from 'react';
import {
  ValueWithCallbacks,
  createWritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../../lib/Callbacks';

export type MappedValueWithCallbacksOpts<T, U> = {
  /**
   * The function which can be used to determine if the two inputs are identical
   * for the purposes of the mapping function. If they are identical, the mapper
   * isn't called. For this to be helpful, this has to be faster than just calling
   * the mapper function and comparing the outputs.
   *
   * By default this is === for number, string, undefined, and null, and false
   * for objects (see defaultEqualtyFn)
   *
   * @param a The first input
   * @param b The second input
   * @returns True if the two inputs are functionally identical, false otherwise
   */
  inputEqualityFn?: (a: T, b: T) => boolean;

  /**
   * The function which can be used to determine if the two outputs are
   * identical. This will skip callbacks on the output value, which can be a
   * performance improvement.
   *
   * By default this is === for number, string, undefined, and null, and false
   * for objects (see defaultEqualtyFn)
   *
   * @param a The first output
   * @param b The second output
   * @returns True if they are the same, false otherwise
   * @default false
   */
  outputEqualityFn?: (a: U, b: U) => boolean;
};

export const defaultEqualityFn = <T>(a: T, b: T) => {
  if (
    a === null ||
    a === undefined ||
    typeof a === 'number' ||
    typeof a === 'string' ||
    typeof a === 'boolean'
  ) {
    return a === b;
  }

  return false;
};

/**
 * Creates a new value with callbacks which maps the original value using the
 * given mapper function, functioning as a react hook.
 *
 * @param original The original value with callbacks
 * @param mapper The mapper function
 * @param rawOpts Additional options while mapping
 * @returns The mapped value with callbacks
 */
export const useMappedValueWithCallbacks = <T, U>(
  original: ValueWithCallbacks<T>,
  mapper: (value: T) => U,
  rawOpts?: MappedValueWithCallbacksOpts<T, U>
): ValueWithCallbacks<U> => {
  return useMappedDeltaValueWithCallbacks(
    original,
    useCallback((_, value) => mapper(value), [mapper]),
    rawOpts
  );
};
/**
 * Creates a new value with callbacks which maps the original value using the
 * given mapper function, functioning as a react hook. The mapper is passed
 * the last input the mapper was passed as well as the new input, allowing
 * delta detection.
 *
 * @param original The original value with callbacks
 * @param mapper The mapper function
 * @param rawOpts Additional options while mapping
 * @returns The mapped value with callbacks
 */
export const useMappedDeltaValueWithCallbacks = <T, U>(
  original: ValueWithCallbacks<T>,
  mapper: (oldValue: T | undefined, newValue: T) => U,
  rawOpts?: MappedValueWithCallbacksOpts<T, U>
): ValueWithCallbacks<U> => {
  const opts: Required<MappedValueWithCallbacksOpts<T, U>> = Object.assign(
    {
      inputEqualityFn: defaultEqualityFn,
      outputEqualityFn: defaultEqualityFn,
    },
    rawOpts
  );
  const lastInputRef = useRef(original.get());
  const result = useWritableValueWithCallbacks<U>(() => {
    const newInput = original.get();
    lastInputRef.current = newInput;
    return mapper(undefined, newInput);
  });

  useEffect(() => {
    original.callbacks.add(handleChange);
    handleChange();
    return () => {
      original.callbacks.remove(handleChange);
    };

    function handleChange() {
      const newInput = original.get();
      if (opts.inputEqualityFn.call(undefined, lastInputRef.current, newInput)) {
        return;
      }

      const newOutput = mapper(lastInputRef.current, newInput);
      lastInputRef.current = newInput;

      if (opts.outputEqualityFn.call(undefined, result.get(), newOutput)) {
        return;
      }
      result.set(newOutput);
      result.callbacks.call(undefined);
    }
  }, [original, result, mapper, opts.inputEqualityFn, opts.outputEqualityFn]);

  return result;
};

/**
 * Creates a new value with callbacks which maps the original value using the
 * given mapper function. This is not a react hook and will return a different
 * result each time its called. The result requires cleanup to detach it
 * from the original value.
 *
 * @param original The original value with callbacks
 * @param mapper The mapper function
 * @param rawOpts Additional options while mapping
 * @returns The mapped value with callbacks
 * @see useMappedValueWithCallbacks
 */
export const createMappedValueWithCallbacks = <T, U>(
  original: ValueWithCallbacks<T>,
  mapper: (value: T) => U,
  rawOpts?: MappedValueWithCallbacksOpts<T, U>
): [ValueWithCallbacks<U>, () => void] => {
  const opts: Required<MappedValueWithCallbacksOpts<T, U>> = Object.assign(
    {
      inputEqualityFn: defaultEqualityFn,
      outputEqualityFn: defaultEqualityFn,
    },
    rawOpts
  );
  let lastInput = original.get();

  const result = createWritableValueWithCallbacks<U>(mapper(lastInput));
  const handleChange = () => {
    if (opts.inputEqualityFn.call(undefined, lastInput, original.get())) {
      return;
    }

    const newOutput = mapper(original.get());
    if (opts.outputEqualityFn.call(undefined, result.get(), newOutput)) {
      return;
    }

    lastInput = original.get();
    result.set(newOutput);
    result.callbacks.call(undefined);
  };

  original.callbacks.add(handleChange);
  return [result, () => original.callbacks.remove(handleChange)];
};
