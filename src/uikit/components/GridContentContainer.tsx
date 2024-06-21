import { CSSProperties, PropsWithChildren, ReactElement, useEffect } from 'react';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import styles from './GridContentContainer.module.css';
import { setVWC } from '../lib/setVWC';
import { convertLogicalWidthToPhysicalWidth } from '../images/DisplayRatioHelper';
import { useStyleVWC } from '../hooks/useStyleVWC';
import { useMappedValuesWithCallbacks } from '../hooks/useMappedValuesWithCallbacks';
import { useReactManagedValueAsValueWithCallbacks } from '../hooks/useReactManagedValueAsValueWithCallbacks';

/**
 * The standard grid container for content. This returns a div that
 * will span the entire grid of the parent (grid-area 1 / 1 / -1 / -1),
 * center/center a child `ContentContainer` with the given width containing
 * the given children.
 *
 * Typical vdom layout:
 * ```tsx
 * <GridFullscreenContainer>
 *   <GridContentContainer>
 *     <div>stuff</div>
 *   </GridContentContainer>
 * </GridFullscreenContainer>
 * ```
 */
export const GridContentContainer = ({
  contentWidthVWC,
  left,
  opacity,
  gridSizeVWC,
  justifyContent,
  noPointerEvents,
  children,
}: PropsWithChildren<{
  contentWidthVWC: ValueWithCallbacks<number | null>;
  /**
   * The absolute size of the grid, usually windowSizeImmediate
   * For some god-awful reason grid-area 1 / 1 / -1 / -1 works for
   * the x-axis but chrome realllly wants to expand it on the y-axis
   */
  gridSizeVWC: ValueWithCallbacks<{ width: number; height: number } | null>;
  /** Left offset for slide transitions */
  left?: ValueWithCallbacks<number>;
  /** Opacity for fade transitions */
  opacity?: ValueWithCallbacks<number>;
  /** Overrides justify-content from center */
  justifyContent?: CSSProperties['justifyContent'];
  /** If true, disables pointer events on the container itself */
  noPointerEvents?: boolean;
}>): ReactElement => {
  const containerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);

  const containerTransitionState = useWritableValueWithCallbacks<{ left: number; opacity: number }>(
    () => ({
      left: left?.get() ?? 0,
      opacity: opacity?.get() ?? 1,
    })
  );

  useEffect(() => {
    if (left === undefined && opacity === undefined) {
      setVWC(containerTransitionState, { left: 0, opacity: 1 });
      return;
    }

    left?.callbacks.add(update);
    opacity?.callbacks.add(update);
    update();
    return () => {
      left?.callbacks.remove(update);
      opacity?.callbacks.remove(update);
    };

    function update() {
      setVWC(
        containerTransitionState,
        {
          left: left?.get() ?? 0,
          opacity: opacity?.get() ?? 1,
        },
        (a, b) => a.left === b.left && a.opacity === b.opacity
      );
    }
  }, [left, opacity, containerTransitionState]);

  const containerStyleVWC = useMappedValuesWithCallbacks(
    [
      containerTransitionState,
      gridSizeVWC,
      useReactManagedValueAsValueWithCallbacks(noPointerEvents),
    ],
    (): CSSProperties => {
      const transitionState = containerTransitionState.get();
      const leftValue = transitionState.left;
      const opacityValue = transitionState.opacity;

      const leftIsZero = convertLogicalWidthToPhysicalWidth(Math.abs(leftValue)) < 1;
      const opacityIsOne = opacityValue > 0.999;

      const gridSize = gridSizeVWC.get();

      return {
        position: leftIsZero ? 'static' : 'relative',
        left: leftIsZero ? '0' : `${leftValue}px`,
        opacity: opacityIsOne ? 1 : opacityValue,
        width: gridSize === null ? 'calc(100vw - 48px)' : `${gridSize.width}px`,
        height: gridSize === null ? '100vh' : `${gridSize.height}px`,
        pointerEvents: noPointerEvents ? 'none' : 'auto',
      };
    }
  );
  useStyleVWC(containerRef, containerStyleVWC);

  const justifyContentVWC = useReactManagedValueAsValueWithCallbacks(justifyContent);
  const overflowerStyleVWC = useMappedValuesWithCallbacks(
    [gridSizeVWC, contentWidthVWC, justifyContentVWC],
    (): CSSProperties => {
      const gridSize = gridSizeVWC.get();
      const contentWidth = contentWidthVWC.get();

      return {
        maxHeight: gridSize === null ? '100vh' : `${gridSize.height}px`,
        width: gridSize === null ? 'calc(100vw - 48px)' : `${gridSize.width}px`,
        padding: `0 ${
          gridSize === null || contentWidth === null ? '24' : (gridSize.width - contentWidth) / 2
        }px`,
        ...(justifyContent !== 'center' && justifyContent !== undefined
          ? { minHeight: gridSize === null ? '100vh' : `${gridSize.height}px` }
          : { minHeight: 'none' }),
      };
    }
  );
  const overflowerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  useStyleVWC(overflowerRef, overflowerStyleVWC);

  const innerStyleVWC = useMappedValuesWithCallbacks(
    [gridSizeVWC, justifyContentVWC],
    (): CSSProperties => {
      const gridSize = gridSizeVWC.get();
      return {
        minHeight:
          justifyContent !== 'center' && justifyContent !== undefined
            ? gridSize === null
              ? '100vh'
              : `${gridSize.height}px`
            : 'none',
        justifyContent,
      };
    }
  );
  const innerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  useStyleVWC(innerRef, innerStyleVWC);

  return (
    <div
      className={styles.container}
      ref={(r) => setVWC(containerRef, r)}
      style={containerStyleVWC.get()}>
      <div
        className={styles.overflower}
        style={overflowerStyleVWC.get()}
        ref={(r) => setVWC(overflowerRef, r)}>
        <div className={styles.inner} ref={(r) => setVWC(innerRef, r)} style={innerStyleVWC.get()}>
          {children}
        </div>
      </div>
    </div>
  );
};
