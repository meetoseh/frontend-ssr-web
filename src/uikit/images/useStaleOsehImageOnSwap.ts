import { useCallback } from 'react';
import { OsehImageState } from './OsehImageState';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';

/**
 * Wraps a oseh image state value with callbacks, typically from
 * `useOsehImageStateValueWithCallbacks`, in such a way that if the
 * underlying image switches to loading, the resulting image keeps the
 * old image url until the new image is loaded.
 *
 * This is useful for preventing UI flickers when the UI is resized,
 * causing the underlying image to be recropped.
 *
 * @param image The image to wrap.
 * @returns The wrapped image.
 */
export const useStaleOsehImageOnSwap = (
  image: ValueWithCallbacks<OsehImageState>
): ValueWithCallbacks<OsehImageState> => {
  const result = useWritableValueWithCallbacks(() => image.get());

  useValueWithCallbacksEffect(
    image,
    useCallback(
      (img) => {
        const oldResult = result.get();
        if (!img.loading || oldResult.loading) {
          result.set(img);
          result.callbacks.call(undefined);
          return undefined;
        }

        if (
          oldResult.displayWidth !== img.displayWidth ||
          oldResult.displayHeight !== img.displayHeight
        ) {
          result.set({
            ...oldResult,
            displayWidth: img.displayWidth,
            displayHeight: img.displayHeight,
          });
          result.callbacks.call(undefined);
          return undefined;
        }
      },
      [result]
    )
  );

  return result;
};
