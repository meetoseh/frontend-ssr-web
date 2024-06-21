import {
  ValueWithCallbacks,
  createWritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useValueWithCallbacksEffect } from './useValueWithCallbacksEffect';

/**
 * Returns the given vwc but with changes delayed by the given amount, merging
 * changes that occur within the delay period into a single update. AKA debouncing.
 */
export const useDelayedValueWithCallbacks = <T>(
  vwc: ValueWithCallbacks<T>,
  delayMs: number
): ValueWithCallbacks<T> => {
  const result = useWritableValueWithCallbacks(() => vwc.get());

  useValueWithCallbacksEffect(vwc, (newValue) => {
    if (window === undefined) {
      return undefined;
    }

    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      timeout = null;
      setVWC(result, newValue);
    }, delayMs);

    return () => {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    };
  });

  return result;
};

/**
 * Same thing as useDelayedValueWithCallbacks, but not within a react hook
 * context.
 */
export const createDelayedValueWithCallbacks = <T>(
  vwc: ValueWithCallbacks<T>,
  delayMs: number
): [ValueWithCallbacks<T>, () => void] => {
  const result = createWritableValueWithCallbacks(vwc.get());
  let timeout: NodeJS.Timeout | null = null;
  vwc.callbacks.add(update);
  return [
    result,
    () => {
      vwc.callbacks.remove(update);
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    },
  ];

  function update() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => {
      timeout = null;
      setVWC(result, vwc.get());
    }, delayMs);
  }
};
