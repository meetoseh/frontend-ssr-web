import { useEffect, useMemo } from 'react';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useDelayedValueWithCallbacks } from './useDelayedValueWithCallbacks';
import { useContentWidthValueWithCallbacks } from './useContentWidthValueWithCallbacks';

type WindowSize = {
  width: number;
  height: number;
};

export type StandardContext = {
  /**
   * The size of the window, as if by `useWindowSize`. This will be updated
   * without delay, so caution needs to be taken to account for potentially
   * rapid (every frame) changes in window size if the user is dragging.
   *
   * Often it makes sense to use `windowSizeImmediate` for the HTML size
   * to render images and `windowSizeDebounced` for downloading images.
   *
   * Null on the server.
   */
  windowSizeImmediate: ValueWithCallbacks<WindowSize | null>;

  /**
   * A debounced version of `windowSizeImmediate`, as if via
   * `useDelayedValueWithCallbacks(windowSizeImmediate)` with an
   * arbitrary but small delay (to avoid inconsistency on the debounce
   * timeout).
   *
   * Null on the server.
   */
  windowSizeDebounced: ValueWithCallbacks<WindowSize | null>;

  /**
   * The suggested width of the content area for app-like screens. This will
   * allow for the appropriate horizontal padding when centered within the
   * viewport. Updates immediately when the window size changes.
   *
   * Null on the server.
   */
  contentWidth: ValueWithCallbacks<number | null>;

  /** True to use webp images, false never to use webp images */
  usesWebp: boolean;

  /** True to use svg vector images, false never to use svg vector images */
  usesSvg: boolean;
};

/**
 * Initializes common context information.
 */
export const useStandardContext = (): StandardContext => {
  const windowSizeImmediate = useWritableValueWithCallbacks<WindowSize | null>(() => null);
  useEffect(() => {
    if (window === undefined) {
      return;
    }

    let active = true;
    window.addEventListener('resize', update);
    update();
    return () => {
      active = false;
      window.removeEventListener('resize', update);
    };

    function update() {
      if (!active) {
        return;
      }

      setVWC(
        windowSizeImmediate,
        {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        (a, b) =>
          a === null || b === null ? a === b : a.width === b.width && a.height === b.height
      );
    }
  }, [windowSizeImmediate]);
  const windowSizeDebounced = useDelayedValueWithCallbacks(windowSizeImmediate, 100);
  const contentWidth = useContentWidthValueWithCallbacks(windowSizeImmediate);

  return useMemo(
    () => ({
      windowSizeImmediate,
      windowSizeDebounced,
      contentWidth,
      usesWebp: true,
      usesSvg: true,
    }),
    [windowSizeImmediate, windowSizeDebounced, contentWidth]
  );
};
