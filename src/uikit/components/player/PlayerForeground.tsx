import { CSSProperties, ReactElement, useCallback, useEffect, useRef } from 'react';
import { OsehMediaContentState } from '../../content/OsehMediaContentState';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../lib/Callbacks';
import { useMappedValueWithCallbacks } from '../../hooks/useMappedValueWithCallbacks';
import { useMappedValuesWithCallbacks } from '../../hooks/useMappedValuesWithCallbacks';
import { OsehTranscriptPhrase } from '../../transcripts/OsehTranscript';
import { useValueWithCallbacksEffect } from '../../hooks/useValueWithCallbacksEffect';
import { setVWC } from '../../lib/setVWC';
import styles from './PlayerForeground.module.css';
import { useStyleVWC } from '../../hooks/useStyleVWC';
import assistiveStyles from '../../styles/assistive.module.css';
import { RenderGuardedComponent } from '../RenderGuardedComponent';
import { ErrorBlock } from '../ErrorBlock';
import { InlineOsehSpinner } from '../InlineOsehSpinner';
import { combineClasses } from '../../lib/combineClasses';
import { useAnimatedValueWithCallbacks } from '../../anim/useAnimatedValueWithCallbacks';
import { BezierAnimator } from '../../anim/AnimationLoop';
import { ease } from '../../lib/Bezier';
import { Wordmark } from '../footer/Wordmark';
import {
  UseCurrentTranscriptPhrasesResult,
  fadeTimeSeconds,
  holdLateSeconds,
} from '../../transcripts/useCurrentTranscriptPhrases';
import { MediaInfo } from '../../hooks/useMediaInfo';

export type PlayerForegroundProps<T extends HTMLMediaElement> = {
  /**
   * The size to render the player foreground at, or null not to load or
   * render at all.
   */
  size: ValueWithCallbacks<{ width: number; height: number } | null>;

  /**
   * The underlying media, which has an audio component that this player
   * cares about, but could also have a video component which you are
   * placing underneath the player foreground (otherwise, the player
   * foreground should be rendered on top of an image)
   */
  content: ValueWithCallbacks<OsehMediaContentState<T>>;

  /** The media info for the content */
  mediaInfo: MediaInfo;

  /**
   * The transcript for the media
   */
  transcript: ValueWithCallbacks<UseCurrentTranscriptPhrasesResult>;

  /** The title for the content, e.g., the name of the journey */
  title: string | ReactElement;

  /** If a subtitle should be rendered, e.g., the instructor name, the subtitle to render */
  subtitle?: string | ReactElement | undefined;

  /**
   * If a header, which is just the Oseh wordmark, should be rendered.
   * Default false.
   */
  header?: boolean;

  /**
   * If specified, adds a tag in the top-left containing this element/text.
   */
  label?: string | ReactElement;
};

/**
 * Displays the overlay for media, either an audio file or video file. Doesn't
 * handle the background image (for audio) or actually rendering the video (for
 * video)
 */
export const PlayerForeground = <T extends HTMLMediaElement>({
  size,
  content,
  mediaInfo,
  transcript,
  title,
  subtitle,
  label,
  header = false,
}: PlayerForegroundProps<T>): ReactElement => {
  const onPlayButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const state = mediaInfo.playPauseState.get();
      const cont = content.get();

      if (cont.element === null) {
        return;
      }

      if (state === 'playing') {
        cont.element.pause();
      } else {
        cont.element.play();
      }
    },
    [mediaInfo, content]
  );

  const onMuteButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const cont = content.get();

      if (cont.element === null) {
        return;
      }

      cont.element.muted = !cont.element.muted;
    },
    [content]
  );

  const progressFullRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressFullRef.current === null) {
      return;
    }
    const progressFull = progressFullRef.current;

    mediaInfo.progress.callbacks.add(onProgressChanged);
    onProgressChanged();
    return () => {
      mediaInfo.progress.callbacks.remove(onProgressChanged);
    };

    function onProgressChanged() {
      const progress = mediaInfo.progress.get();
      progressFull.style.width = `${progress * 100}%`;
    }
  }, [mediaInfo.progress]);

  const onProgressContainerClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();

      const cont = content.get();
      if (cont.element === null) {
        return;
      }

      const location = e.clientX;
      const clickedButton = e.currentTarget;
      const clickedButtonRects = clickedButton.getBoundingClientRect();
      const progress = (location - clickedButtonRects.left) / clickedButtonRects.width;
      const seekingTo = progress * cont.element.duration;
      cont.element.currentTime = seekingTo;
    },
    [content]
  );

  const onClosedCaptioningClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();

      setVWC(mediaInfo.closedCaptioning.enabled, !mediaInfo.closedCaptioning.enabled.get());
    },
    [mediaInfo.closedCaptioning]
  );

  const containerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const containerStyle = useMappedValueWithCallbacks(size, (size): CSSProperties => {
    if (size === null || (size.width <= 0 && size.height <= 0)) {
      return {
        display: 'none',
      };
    }
    return {
      display: 'flex',
      width: `${size.width}px`,
      height: `${size.height}px`,
    };
  });
  useStyleVWC(containerRef, containerStyle);

  return (
    <div className={styles.container} ref={(r) => setVWC(containerRef, r)}>
      {header && (
        <div className={styles.header}>
          <div className={styles.wordmarkContainer}>
            <a className={styles.wordmark} href="https://www.oseh.com">
              <Wordmark size={{ height: 20 }} color="white" />
              <div className={assistiveStyles.srOnly}>Oseh</div>
            </a>
          </div>
        </div>
      )}
      {label && (
        <div className={styles.labelContainer}>
          <div className={styles.label}>{label}</div>
        </div>
      )}
      <div className={styles.spacer} />
      <div className={styles.playContainer}>
        <button type="button" className={styles.playButton} onClick={onPlayButtonClick}>
          <RenderGuardedComponent
            props={mediaInfo.playPauseState}
            component={(state) => {
              if (state === 'paused') {
                return <div className={styles.iconPlay} />;
              }
              if (state === 'playing') {
                return <div className={styles.iconPause} />;
              }
              if (state === 'errored') {
                const err = content.get().error;
                if (err !== null) {
                  return err;
                }
                const mediaError = content.get().element?.error;
                if (mediaError !== undefined && mediaError !== null) {
                  return (
                    <ErrorBlock>
                      {mediaError.code}: {mediaError.message}
                    </ErrorBlock>
                  );
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
        <RenderGuardedComponent
          props={mediaInfo.closedCaptioning.available}
          component={(available) =>
            !available ? (
              <></>
            ) : (
              <RenderGuardedComponent
                props={mediaInfo.closedCaptioning.enabled}
                component={(desired) => (
                  <div
                    className={combineClasses(
                      styles.transcriptContainer,
                      styles['transcriptContainer__' + desired]
                    )}>
                    <RenderGuardedComponent
                      props={transcript}
                      component={(phrases) => (
                        <>
                          {phrases.phrases.map(({ phrase, id }) => (
                            <TranscriptPhrase
                              phrase={phrase}
                              currentTime={mediaInfo.currentTime}
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
            )
          }
        />
        <div className={styles.controlsContainer}>
          <div className={styles.titleAndInstructorContainer}>
            {subtitle !== undefined && <div className={styles.instructor}>{subtitle}</div>}
            <div className={styles.title}>{title}</div>
          </div>
          <div className={styles.buttonsContainer}>
            <button className={styles.button} type="button" onClick={onMuteButtonClick}>
              <RenderGuardedComponent
                props={mediaInfo.muted}
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
            <RenderGuardedComponent
              props={mediaInfo.closedCaptioning.available}
              component={(available) =>
                !available ? (
                  <></>
                ) : (
                  <button className={styles.button} type="button" onClick={onClosedCaptioningClick}>
                    <RenderGuardedComponent
                      props={mediaInfo.closedCaptioning.enabled}
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
                )
              }
            />
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
              props={mediaInfo.currentTime}
              component={(inSeconds) => {
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
          <RenderGuardedComponent
            props={mediaInfo.totalTime}
            component={(totalTime) => <div className={styles.totalTime}>{totalTime.formatted}</div>}
          />
        </div>
      </div>
    </div>
  );
};

const TranscriptPhrase = (
  props: React.PropsWithChildren<{
    currentTime: ValueWithCallbacks<number>;
    phrase: OsehTranscriptPhrase;
  }>
): ReactElement => {
  const ele = useRef<HTMLDivElement>(null);
  const opacityTarget = useMappedValuesWithCallbacks(
    [props.currentTime],
    useCallback(() => {
      const progressSeconds = props.currentTime.get();
      const timeUntilEnd = props.phrase.endsAt + holdLateSeconds - progressSeconds;
      return timeUntilEnd < fadeTimeSeconds ? 0 : 1;
    }, [props.phrase])
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
