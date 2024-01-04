import { useEffect } from 'react';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';

/**
 * A useEffect-like function which calls the given effect function whenever any
 * of the values changes. The effect function may return a cleanup function,
 * which will be called before the next effect function call or before the
 * component unmounts.
 *
 * This will also cleanup and call the effect again if the effect function
 * changes or the the vwcs themselves change (as compared with Object.is).
 *
 * @param vwcs The values with callbacks to watch.
 * @param effect The effect function to call when the value changes.
 */
export function useValuesWithCallbacksEffect<U, T extends ValueWithCallbacks<U>>(
  vwcs: T[],
  effect: () => (() => void) | undefined
): void {
  const vwcsVWC = useWritableValueWithCallbacks(() => vwcs);
  if (
    vwcs.length !== vwcsVWC.get().length ||
    vwcs.some((vwc, i) => !Object.is(vwc, vwcsVWC.get()[i]))
  ) {
    vwcsVWC.set([...vwcs]);
    vwcsVWC.callbacks.call(undefined);
  }

  useEffect(() => {
    let outerCanceler: (() => void) | undefined = undefined;
    vwcsVWC.callbacks.add(handleVWCsChanged);
    handleVWCsChanged();
    return () => {
      vwcsVWC.callbacks.remove(handleVWCsChanged);
      outerCanceler?.();
      outerCanceler = undefined;
    };

    function handleVWCS(inner: T[]): () => void {
      let canceler: (() => void) | undefined = undefined;
      inner.forEach((vwc) => vwc.callbacks.add(handleValueChanged));
      handleValueChanged();
      return () => {
        inner.forEach((vwc) => vwc.callbacks.remove(handleValueChanged));
        canceler?.();
        canceler = undefined;
      };

      function handleValueChanged(): void {
        canceler?.();
        canceler = effect();
      }
    }

    function handleVWCsChanged() {
      outerCanceler?.();
      outerCanceler = handleVWCS(vwcsVWC.get());
    }
  }, [effect, vwcsVWC]);
}
