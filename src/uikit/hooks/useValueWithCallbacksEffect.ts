import { useEffect } from 'react';
import { ValueWithCallbacks } from '../lib/Callbacks';

/**
 * A useEffect-like function which calls the given effect function whenever the
 * value changes. The effect function is passed the new value. The effect
 * function may return a cleanup function, which will be called before the next
 * effect function call or before the component unmounts.
 *
 * This will also cleanup and call the effect again if the effect function
 * changes. Use useCallback to prevent this.
 *
 * @param vwc The value with callbacks to watch.
 * @param effect The effect function to call when the value changes.
 */
export const useValueWithCallbacksEffect = <T>(
  vwc: ValueWithCallbacks<T>,
  effect: (value: T) => (() => void) | undefined
): void => {
  useEffect(() => {
    let canceler: (() => void) | undefined = undefined;
    vwc.callbacks.add(handleValueChanged);
    handleValueChanged();
    return () => {
      vwc.callbacks.remove(handleValueChanged);
      canceler?.();
      canceler = undefined;
    };

    function handleValueChanged(): void {
      canceler?.();
      canceler = effect(vwc.get());
    }
  }, [vwc, effect]);
};
