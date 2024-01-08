import { ReactElement, useCallback, useEffect, useMemo, useRef } from 'react';
import styles from './Player.module.css';
import assistiveStyles from '../../../uikit/styles/assistive.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { useOsehImageStateRequestHandler } from '../../../uikit/images/useOsehImageStateRequestHandler';
import { useStaleOsehImageOnSwap } from '../../../uikit/images/useStaleOsehImageOnSwap';
import { useOsehImageStateValueWithCallbacks } from '../../../uikit/images/useOsehImageStateValueWithCallbacks';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { OsehImageFromState } from '../../../uikit/images/OsehImageFromState';
import { setVWC } from '../../../uikit/lib/setVWC';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useOsehAudioContentState } from '../../../uikit/content/useOsehAudioContentState';
import { useOsehContentTarget } from '../../../uikit/content/useOsehContentTarget';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { ErrorBlock } from '../../../uikit/components/ErrorBlock';
import { InlineOsehSpinner } from '../../../uikit/components/InlineOsehSpinner';
import { useMappedValuesWithCallbacks } from '../../../uikit/hooks/useMappedValuesWithCallbacks';
import { OsehTranscriptPhrase } from '../../../uikit/transcripts/OsehTranscript';
import { combineClasses } from '../../../uikit/lib/combineClasses';
import { useAnimatedValueWithCallbacks } from '../../../uikit/anim/useAnimatedValueWithCallbacks';
import { BezierAnimator } from '../../../uikit/anim/AnimationLoop';
import { ease } from '../../../uikit/lib/Bezier';

type Size = { width: number; height: number };

const areSizesEqual = (a: Size | null, b: Size | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.width === b.width && a.height === b.height;
};

type ClosedCaptioningDesired = 'none' | 'small' | 'big';
const CLOSED_CAPTIONING_DESIRED_VALUES: ClosedCaptioningDesired[] = ['none', 'small', 'big'];

const fadeTimeSeconds = 0.5;
const showEarlySeconds = fadeTimeSeconds;
const holdLateSeconds = 5 + fadeTimeSeconds;

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

  const contentTarget = useOsehContentTarget({
    uid: props.audio.uid,
    jwt: props.audio.jwt,
  });
  const audioContent = useOsehAudioContentState({
    type: 'callbacks',
    props: () => contentTarget.get(),
    callbacks: contentTarget.callbacks,
  });

  const progressVWC = useWritableValueWithCallbacks<number>(() => 0);
  const audioState = useWritableValueWithCallbacks<'playing' | 'paused' | 'loading' | 'errored'>(
    () => 'loading'
  );
  const muted = useWritableValueWithCallbacks<boolean>(() => false);
  const closedCaptioningDesired = useWritableValueWithCallbacks<ClosedCaptioningDesired>(
    () => 'small'
  );

  const transcriptSearchIndexHint = useRef<{ progressSeconds: number; index: number }>({
    progressSeconds: 0,
    index: 0,
  });
  const currentTranscriptPhrases = useMappedValuesWithCallbacks(
    [closedCaptioningDesired, props.transcript, progressVWC],
    (): { phrase: OsehTranscriptPhrase; id: number }[] => {
      if (closedCaptioningDesired.get() === 'none') {
        return [];
      }

      const transcriptRaw = props.transcript.get();
      if (transcriptRaw.type !== 'success') {
        return [];
      }

      const phrases = transcriptRaw.transcript.phrases;
      const progress = progressVWC.get();
      const progressSeconds = progress * props.durationSeconds;
      const hint = transcriptSearchIndexHint.current;

      if (hint.progressSeconds > progressSeconds) {
        hint.progressSeconds = 0;
        hint.index = 0;
      }

      if (hint.index >= phrases.length) {
        return [];
      }

      while (
        hint.index < phrases.length &&
        phrases[hint.index].startsAt - showEarlySeconds < progressSeconds &&
        phrases[hint.index].endsAt + holdLateSeconds < progressSeconds
      ) {
        hint.index++;
      }
      hint.progressSeconds =
        hint.index < phrases.length
          ? phrases[hint.index].startsAt - showEarlySeconds
          : phrases[hint.index - 1].endsAt + holdLateSeconds;
      if (hint.index >= phrases.length) {
        return [];
      }

      const result: { phrase: OsehTranscriptPhrase; id: number }[] = [];
      let index = hint.index;
      while (
        index < phrases.length &&
        phrases[index].startsAt - showEarlySeconds < progressSeconds &&
        phrases[index].endsAt + holdLateSeconds > progressSeconds
      ) {
        result.push({ phrase: phrases[index], id: index });
        index++;
      }
      return result;
    }
  );

  useValueWithCallbacksEffect(audioContent, (content) => {
    if (content.error !== null) {
      setVWC(audioState, 'errored');
      return undefined;
    }

    if (!content.loaded) {
      setVWC(audioState, 'loading');
      return;
    }

    if (audioState.get() === 'loading') {
      setVWC(audioState, 'paused');
    }

    if (content.audio === null) {
      return;
    }
    const audio = content.audio;
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onPause);
    audio.addEventListener('volumechange', onVolumeChange);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onPause);
      audio.removeEventListener('volumechange', onVolumeChange);
    };

    function onPlay() {
      setVWC(audioState, 'playing');
    }

    function onPause() {
      setVWC(audioState, 'paused');
    }

    function onTimeUpdate() {
      if (isNaN(audio.duration) || isNaN(audio.currentTime) || audio.duration === 0) {
        setVWC(progressVWC, 0);
        return;
      }

      const progress = audio.currentTime / audio.duration;
      setVWC(progressVWC, progress);
    }

    function onVolumeChange() {
      setVWC(muted, audio.muted);
    }
  });

  const onPlayButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const state = audioState.get();
    const content = audioContent.get();

    if (content.audio === null) {
      return;
    }

    if (state === 'playing') {
      content.audio.pause();
    } else {
      content.audio.play();
    }
  }, []);

  const onMuteButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const content = audioContent.get();

    if (content.audio === null) {
      return;
    }

    content.audio.muted = !content.audio.muted;
    setVWC(muted, content.audio.muted);
  }, []);

  const progressFullRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressFullRef.current === null) {
      return;
    }
    const progressFull = progressFullRef.current;

    progressVWC.callbacks.add(onProgressChanged);
    onProgressChanged();
    return () => {
      progressVWC.callbacks.remove(onProgressChanged);
    };

    function onProgressChanged() {
      const progress = progressVWC.get();
      progressFull.style.width = `${progress * 100}%`;
    }
  }, []);

  const onProgressContainerClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const content = audioContent.get();
    if (content.audio === null) {
      return;
    }

    const location = e.clientX;
    const clickedButton = e.currentTarget;
    const clickedButtonRects = clickedButton.getBoundingClientRect();
    const progress = (location - clickedButtonRects.left) / clickedButtonRects.width;
    const seekingTo = progress * content.audio.duration;
    content.audio.currentTime = seekingTo;
  }, []);

  const onClosedCaptioningClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const current = closedCaptioningDesired.get();
    setVWC(
      closedCaptioningDesired,
      CLOSED_CAPTIONING_DESIRED_VALUES[
        (CLOSED_CAPTIONING_DESIRED_VALUES.indexOf(current) + 1) %
          CLOSED_CAPTIONING_DESIRED_VALUES.length
      ]
    );
  }, []);

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
        <button type="button" className={styles.playButton} onClick={onPlayButtonClick}>
          <RenderGuardedComponent
            props={audioState}
            component={(state) => {
              if (state === 'paused') {
                return <div className={styles.iconPlay} />;
              }
              if (state === 'playing') {
                return <div className={styles.iconPause} />;
              }
              if (state === 'errored') {
                const err = audioContent.get().error;
                if (err !== null) {
                  return err;
                }
                return <ErrorBlock>Something went wrong.</ErrorBlock>;
              }
              return (
                <InlineOsehSpinner
                  size={{
                    type: 'react-rerender',
                    props: { height: 20 },
                  }}
                />
              );
            }}
          />
        </button>
      </div>
      <div className={styles.bottomContents}>
        {props.transcriptRef !== null && (
          <RenderGuardedComponent
            props={closedCaptioningDesired}
            component={(desired) => (
              <div
                className={combineClasses(
                  styles.transcriptContainer,
                  styles['transcriptContainer__' + desired]
                )}>
                <RenderGuardedComponent
                  props={currentTranscriptPhrases}
                  component={(phrases) => (
                    <>
                      {phrases.map(({ phrase, id }) => (
                        <TranscriptPhrase
                          phrase={phrase}
                          progress={progressVWC}
                          durationSeconds={props.durationSeconds}
                          key={id}>
                          {phrase.phrase}
                        </TranscriptPhrase>
                      ))}
                    </>
                  )}
                />
              </div>
            )}
          />
        )}
        <div className={styles.controlsContainer}>
          <div className={styles.titleAndInstructorContainer}>
            <div className={styles.instructor}>{props.instructor}</div>
            <div className={styles.title}>{props.title}</div>
          </div>
          <div className={styles.buttonsContainer}>
            <button className={styles.button} type="button" onClick={onMuteButtonClick}>
              <RenderGuardedComponent
                props={muted}
                component={(muted) => {
                  if (!muted) {
                    return (
                      <>
                        <div className={styles.iconUnmute} />
                        <div className={assistiveStyles.srOnly}>Mute</div>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <div className={styles.iconMute} />
                        <div className={assistiveStyles.srOnly}>Unmute</div>
                      </>
                    );
                  }
                }}
              />
            </button>
            {props.transcriptRef !== null && (
              <button className={styles.button} type="button" onClick={onClosedCaptioningClick}>
                <RenderGuardedComponent
                  props={closedCaptioningDesired}
                  component={(desired) => (
                    <div
                      className={combineClasses(
                        styles.iconClosedCaptions,
                        styles['iconClosedCaptions__' + desired]
                      )}
                    />
                  )}
                />
              </button>
            )}
          </div>
        </div>
        <button
          className={styles.progressContainer}
          type="button"
          onClick={onProgressContainerClick}>
          <div className={styles.progressFull} style={{ width: '0' }} ref={progressFullRef} />
          <div className={styles.progressDot} />
          <div className={styles.progressEmpty} />
        </button>
        <div className={styles.durationContainer}>
          <div className={styles.currentTime}>
            <RenderGuardedComponent
              props={progressVWC}
              component={(progress) => {
                const inSeconds = Math.floor(props.durationSeconds * progress);
                const minutes = Math.floor(inSeconds / 60);
                const seconds = Math.floor(inSeconds) % 60;

                return (
                  <>
                    {minutes}:{seconds < 10 ? '0' : ''}
                    {seconds}
                  </>
                );
              }}
            />
          </div>
          <div className={styles.totalTime}>{totalTime}</div>
        </div>
      </div>
    </div>
  );
};

const TranscriptPhrase = (
  props: React.PropsWithChildren<{
    progress: ValueWithCallbacks<number>;
    durationSeconds: number;
    phrase: OsehTranscriptPhrase;
  }>
): ReactElement => {
  const ele = useRef<HTMLDivElement>(null);
  const opacityTarget = useMappedValueWithCallbacks(
    props.progress,
    useCallback(
      (progress) => {
        const progressSeconds = progress * props.durationSeconds;
        const timeUntilEnd = props.phrase.endsAt - progressSeconds;

        const opacityAccordingToStart = 1;
        const opacityAccordingToEnd = timeUntilEnd < fadeTimeSeconds ? 0 : 1;
        return Math.min(opacityAccordingToStart, opacityAccordingToEnd);
      },
      [props.durationSeconds, props.phrase]
    )
  );

  const target = useAnimatedValueWithCallbacks<{ opacity: number }>(
    () => ({ opacity: 0 }),
    () => [
      new BezierAnimator(
        ease,
        fadeTimeSeconds * 1000,
        (p) => p.opacity,
        (p, v) => (p.opacity = v)
      ),
    ],
    (val) => {
      if (ele.current !== null) {
        ele.current.style.opacity = val.opacity.toString();
      }
    }
  );

  useValueWithCallbacksEffect(
    opacityTarget,
    useCallback((opacity) => {
      setVWC(target, { opacity }, (a, b) => a.opacity === b.opacity);
      return undefined;
    }, [])
  );

  return (
    <div className={styles.transcriptPhrase} ref={ele}>
      {props.children}
    </div>
  );
};
