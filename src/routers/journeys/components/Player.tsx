import { ReactElement, useEffect, useMemo, useRef } from 'react';
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
    placeholderWidth: string;
    placeholderHeight: string;
  }
): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useWritableValueWithCallbacks<{ width: number; height: number } | null>(
    () => null
  );

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
    }
  }, []);

  const totalTime = useMemo(() => {
    const minutes = Math.floor(props.durationSeconds / 60);
    const seconds = Math.floor(props.durationSeconds % 60);

    return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
  }, [props.durationSeconds]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.background}>
        <RenderGuardedComponent
          props={imageState}
          component={(state) => {
            if (state.loading) {
              return <img className={styles.placeholder} src={props.imageThumbhashDataUrl} />;
            }

            return <OsehImageFromState {...state} />;
          }}
        />
      </div>
      <div className={styles.playContainer}>
        <div className={styles.playButton}>
          <div className={styles.iconPlay} />
        </div>
      </div>
      <div className={styles.bottomContents}>
        <div className={styles.controlsContainer}>
          <div className={styles.titleAndInstructorContainer}>
            <div className={styles.instructor}>{props.instructor}</div>
            <div className={styles.title}>{props.title}</div>
          </div>
          <div className={styles.buttonsContainer}>
            <div className={styles.button}>
              <div className={styles.iconMute} />
            </div>
            <div className={styles.button}>
              <div className={styles.iconClosedCaptions} />
            </div>
          </div>
        </div>
        <div className={styles.progressContainer}>
          <div className={styles.progressFull} style={{ width: '43%' }} />
          <div className={styles.progressDot} />
          <div className={styles.progressEmpty} />
        </div>
        <div className={styles.durationContainer}>
          <div className={styles.currentTime}>0:45</div>
          <div className={styles.totalTime}>{totalTime}</div>
        </div>
      </div>
    </div>
  );
};
