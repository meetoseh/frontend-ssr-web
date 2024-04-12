import { ReactElement, useEffect, useRef } from 'react';
import styles from './Player.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { useOsehImageStateRequestHandler } from '../../../uikit/images/useOsehImageStateRequestHandler';
import { useStaleOsehImageOnSwap } from '../../../uikit/images/useStaleOsehImageOnSwap';
import { useOsehImageStateValueWithCallbacks } from '../../../uikit/images/useOsehImageStateValueWithCallbacks';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { OsehImageFromState } from '../../../uikit/images/OsehImageFromState';
import { setVWC } from '../../../uikit/lib/setVWC';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useOsehAudioContentState } from '../../../uikit/content/useOsehAudioContentState';
import { useOsehContentTargetValueWithCallbacks } from '../../../uikit/content/useOsehContentTargetValueWithCallbacks';
import { useReactManagedValueAsValueWithCallbacks } from '../../../uikit/hooks/useReactManagedValueAsValueWithCallbacks';
import { PlayerForeground } from '../../../uikit/components/player/PlayerForeground';
import { BorderRadius, convertBorderRadiusToStyle } from '../../../uikit/lib/BorderRadius';
import { useMappedValuesWithCallbacks } from '../../../uikit/hooks/useMappedValuesWithCallbacks';

type Size = { width: number; height: number };

const areSizesEqual = (a: Size | null, b: Size | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.width === b.width && a.height === b.height;
};

/**
 * Displays the player for the class. Must be in a container with an explicit
 * width and height and a grid with 1 column and 1 row filling the container
 */
export const Player = (
  props: SharedUnlockedClassBodyDelegateProps & {
    header: boolean;
  }
): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useWritableValueWithCallbacks<{ width: number; height: number } | null>(
    () => null
  );
  const containerBorder = useWritableValueWithCallbacks<BorderRadius>(() => 0);

  const imageProps = useMappedValueWithCallbacks(containerSize, (size) => ({
    uid: size === null ? null : props.backgroundImage.uid,
    jwt: size === null ? null : props.backgroundImage.jwt,
    displayWidth: size?.width ?? 0,
    displayHeight: size?.height ?? 0,
    alt: '',
  }));

  const imageHandler = useOsehImageStateRequestHandler({});
  const imageState = useStaleOsehImageOnSwap(
    useOsehImageStateValueWithCallbacks(
      {
        type: 'callbacks',
        props: () => imageProps.get(),
        callbacks: imageProps.callbacks,
      },
      imageHandler
    )
  );

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const myContainer = containerRef.current;
    if (myContainer.parentElement === null) {
      return;
    }

    const container = myContainer.parentElement;
    const cancelers: (() => void)[] = [];

    if (window?.ResizeObserver) {
      const observer = new ResizeObserver(onSizeChanged);
      observer.observe(container);
      cancelers.push(() => observer.disconnect());
    }

    window.addEventListener('resize', onSizeChanged);
    cancelers.push(() => window.removeEventListener('resize', onSizeChanged));

    onSizeChanged();
    return () => {
      cancelers.forEach((canceler) => canceler());
    };

    function onSizeChanged() {
      const rects = container.getBoundingClientRect();
      if (rects.width <= 0 || rects.height <= 0) {
        setVWC(containerSize, null);
        return;
      }

      setVWC(
        containerSize,
        {
          width: Math.min(document.documentElement.clientWidth, rects.width),
          height: rects.height,
        },
        areSizesEqual
      );

      const isHuggingLeft = rects.left <= 0;
      const isHuggingTop = rects.top <= 0;
      const isHuggingRight = rects.right >= document.documentElement.clientWidth;
      const isHuggingBottom = rects.bottom >= window.innerHeight;

      setVWC(
        containerBorder,
        isHuggingLeft || isHuggingTop || isHuggingRight || isHuggingBottom ? 0 : 10
      );
    }
  }, []);

  const contentTarget = useOsehContentTargetValueWithCallbacks({
    ref: useReactManagedValueAsValueWithCallbacks(props.audio),
    comparer: useReactManagedValueAsValueWithCallbacks((a, b) => b.bandwidth - a.bandwidth),
    presign: true,
  });
  const audioContent = useOsehAudioContentState({
    type: 'callbacks',
    props: () => contentTarget.get(),
    callbacks: contentTarget.callbacks,
  });

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.background}>
        <RenderGuardedComponent
          props={useMappedValuesWithCallbacks([containerBorder, imageState], () => ({
            borderRadius: containerBorder.get(),
            state: imageState.get(),
          }))}
          component={({ state, borderRadius }) => {
            if (state.loading) {
              return (
                <img
                  className={styles.placeholder}
                  src={props.imageThumbhashDataUrl}
                  style={convertBorderRadiusToStyle(borderRadius)}
                />
              );
            }

            return <OsehImageFromState {...state} borderRadius={borderRadius} />;
          }}
        />
      </div>
      <div className={styles.foreground}>
        <PlayerForeground
          size={containerSize}
          content={audioContent}
          transcript={props.transcript}
          durationSeconds={props.durationSeconds}
          title={props.title}
          subtitle={props.instructor}
        />
      </div>
    </div>
  );
};
