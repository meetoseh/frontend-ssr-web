import { PropsWithChildren, ReactElement } from 'react';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import styles from './GridFullscreenContainer.module.css';
import { useMappedValueWithCallbacks } from '../hooks/useMappedValueWithCallbacks';
import { useStyleVWC } from '../hooks/useStyleVWC';

/**
 * An element with display grid which fills the full width and the greater of the
 * window height and the content height as the height. This is analagous to the
 * `FullscreenView` in the react-native app, but in web we don't have to use a
 * different dom depending on whether or not scrolling is allowed.
 *
 * This handles the issue where `100vh` is not necessarily the same as `window.innerHeight`
 * and thus `min-height: 100vh` is inadequate for avoiding scrollbars
 */
export const GridFullscreenContainer = ({
  windowSizeImmediate,
  children,
}: PropsWithChildren<{
  windowSizeImmediate: ValueWithCallbacks<{ width: number; height: number } | null>;
}>): ReactElement => {
  const containerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const containerStyleVWC = useMappedValueWithCallbacks(windowSizeImmediate, (ws) => ({
    height: ws === null ? '100vh' : `${ws.height}px`,
    width: ws === null ? '100vw' : `${ws.width}px`,
  }));
  useStyleVWC(containerRef, containerStyleVWC);

  return (
    <div
      className={styles.container}
      ref={(r) => containerRef.set(r)}
      style={containerStyleVWC.get()}>
      {children}
    </div>
  );
};
