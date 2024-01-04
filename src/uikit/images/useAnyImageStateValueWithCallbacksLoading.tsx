import { useEffect, useRef, useState } from 'react';
import { ValueWithCallbacks } from '../lib/Callbacks';
import { OsehImageState } from './OsehImageState';

/**
 * Convenience hook which returns true if any of the image states are loading
 * and false otherwise, triggering react rerenders only if this value changes
 * (not just due to any individual image state changing).
 *
 * @param states The image states to check. If any are null, always returns true.
 * @param numIsConstant If true, states is used directly as the dependency array for the useEffect.
 *   Otherwise, states is wrapped in an array, meaning we probably unmount and remount our useEffect
 *   hook every rerender (minor performance hit). Must be a constant value.
 * @returns True if any of the image states are loading and false otherwise.
 */
export const useAnyImageStateValueWithCallbacksLoading = (
  states: (ValueWithCallbacks<OsehImageState> | null)[],
  numIsConstant: boolean = false
): boolean => {
  const [loading, setLoading] = useState(() => states.some((s) => s === null || s.get().loading));
  const loadingRef = useRef(loading);

  useEffect(
    () => {
      if (states.some((s) => s === null)) {
        if (!loadingRef.current) {
          setLoading(true);
        }
        return;
      }

      for (let i = 0; i < states.length; i++) {
        states[i]!.callbacks.add(recheck);
      }
      let currLoadingValue = loadingRef.current;
      recheck();
      return () => {
        for (let i = 0; i < states.length; i++) {
          states[i]!.callbacks.remove(recheck);
        }
      };

      function recheck() {
        const newLoading = states.some((s) => s!.get().loading);
        if (newLoading !== currLoadingValue) {
          currLoadingValue = newLoading;
          setLoading(newLoading);
        }
      }
    },
    numIsConstant ? states : [states]
  );

  return loading;
};
