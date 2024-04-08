import { useEffect } from 'react';
import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { useUnwrappedValueWithCallbacks } from './useUnwrappedValueWithCallbacks';

/**
 * A basic hook to get the window size with a debounced resize listener. This
 * triggers rerenders as it's a standard hook; avoid that using the VWC
 * variant.
 *
 * @param forcedSize if specified, returned instead of the real window size.
 *   Convenient when you want to render a component that uses this hook at
 *   a specific size, such as in an admin preview.
 */
export const useWindowSize = (forcedSize?: {
  width: number;
  height: number;
}): { width: number; height: number } | null => {
  return useUnwrappedValueWithCallbacks(
    useWindowSizeValueWithCallbacks({ type: 'react-rerender', props: forcedSize })
  );
};

/**
 * The same idea as useWindowSize, except doesn't trigger react rerenders. Only
 * used when it's really important that we don't trigger even a single extra
 * react rerender on a component.
 */
export const useWindowSizeValueWithCallbacks = (
  forcedSizeVariableStrategy?: VariableStrategyProps<{ width: number; height: number } | undefined>
): ValueWithCallbacks<{ width: number; height: number } | null> => {
  const forcedSizeVWC = useVariableStrategyPropsAsValueWithCallbacks(
    forcedSizeVariableStrategy ?? { type: 'react-rerender', props: undefined }
  );
  const result = useWritableValueWithCallbacks<{ width: number; height: number } | null>(() => {
    const forced = forcedSizeVWC.get();
    if (forced !== undefined) {
      return forced;
    }

    // avoid props changing on first load
    return null;
  });

  useEffect(() => {
    if (window === undefined) {
      return;
    }

    let timeout: NodeJS.Timeout | null = null;
    let active = true;

    const onDebounced = () => {
      if (!active) {
        return;
      }

      timeout = null;
      const reported = result.get();
      const correct = getCurrentResult();

      if (
        reported === null ||
        reported.width !== correct.width ||
        reported.height !== correct.height
      ) {
        result.set(correct);
        result.callbacks.call(undefined);
      }
    };

    const onResize = () => {
      if (!active) {
        return;
      }

      if (timeout !== null) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(onDebounced, 100);
    };

    onDebounced();
    window.addEventListener('resize', onResize);

    return () => {
      active = false;
      window.removeEventListener('resize', onResize);

      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };

    function getCurrentResult() {
      const forced = forcedSizeVWC.get();
      if (forced !== undefined) {
        return forced;
      }

      return { width: window.innerWidth, height: window.innerHeight };
    }
  }, [forcedSizeVWC, result]);

  return result;
};
