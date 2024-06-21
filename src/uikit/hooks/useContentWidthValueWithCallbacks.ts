import { useMappedValueWithCallbacks } from '../hooks/useMappedValueWithCallbacks';
import { ValueWithCallbacks } from '../lib/Callbacks';

/**
 * Determines the suggested width of the content area for a app-like screen,
 * after taking into account horizontal padding.
 *
 * Returns null on the server.
 */
export const useContentWidthValueWithCallbacks = (
  windowSizeImmediate: ValueWithCallbacks<{ width: number; height: number } | null>
): ValueWithCallbacks<number | null> => {
  return useMappedValueWithCallbacks(windowSizeImmediate, (ws) => {
    if (ws === null) {
      return null;
    }

    return Math.min(ws.width - 24, 342);
  });
};
