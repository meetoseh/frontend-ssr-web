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
import { combineClasses } from '../../lib/combineClasses';
import { useAnimatedValueWithCallbacks } from '../../anim/useAnimatedValueWithCallbacks';
import { BezierAnimator } from '../../anim/AnimationLoop';
import { ease } from '../../lib/Bezier';
import {
  UseCurrentTranscriptPhrasesResult,
  fadeTimeSeconds,
  holdLateSeconds,
} from '../../transcripts/useCurrentTranscriptPhrases';
import { RenderGuardedComponent } from '../../components/RenderGuardedComponent';
import { InlineOsehSpinner } from '../../components/InlineOsehSpinner';
import { MediaInfo } from '../../hooks/useMediaInfo';
import { IconButton } from '../IconButton';
import { ErrorBlock } from '../ErrorBlock';
import { Button } from '../Button';

export type PlayerCTA = {
  /** The title for the button */
  title: string;
  /**
   * Performs the action; as soon as this is pressed, the media is paused and
   * a spinner state is shown until the promise resolves or rejects.
   */
  action: () => Promise<void>;
};

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
  title: ValueWithCallbacks<string | ReactElement>;

  /** If a subtitle should be rendered, e.g., the instructor name, the subtitle to render */
  subtitle?: ValueWithCallbacks<string | ReactElement | undefined>;

  /**
   * If specified, adds a tag in the top-left containing this element/text.
   */
  label?: string | ReactElement;

  /** The cta to show, or null for no cta, or undefined if there is never a cta */
  cta?: ValueWithCallbacks<PlayerCTA | null>;

  /** The tag to show below the title, or null for no tag, or undefined if there is never a tag */
  tag?: ValueWithCallbacks<string | null>;

  /**
   * A function to show an x in the upper right that uses this handler, or null
   * for no x, or undefined if there is never an x.
   */
  onClose?: ValueWithCallbacks<(() => Promise<void>) | null>;

  /**
   * If true, we will assume the background is dark at the top, which
   * may change some styling.
   */
  assumeDark?: boolean;
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
  cta,
  tag,
  onClose,
  assumeDark,
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

  const handlingCTA = useWritableValueWithCallbacks(() => false);
  const onCTAClick = useCallback(async () => {
    if (cta === undefined) {
      return;
    }
    if (handlingCTA.get()) {
      return;
    }
    const val = cta.get();
    if (val === null) {
      return;
    }

    setVWC(handlingCTA, true);
    try {
      const cont = content.get();
      if (cont.element !== null && !cont.element.paused) {
        cont.element.pause();
      }
      await val.action();
    } finally {
      setVWC(handlingCTA, false);
    }
  }, [cta, handlingCTA, content]);

  const handlingClose = useWritableValueWithCallbacks(() => false);
  const onCloseClick = useCallback(async () => {
    if (onClose === undefined) {
      return;
    }
    if (handlingClose.get()) {
      return;
    }
    const val = onClose.get();
    if (val === null) {
      return;
    }

    setVWC(handlingClose, true);
    try {
      const cont = content.get();
      if (cont.element !== null && !cont.element.paused) {
        cont.element.pause();
      }
      await val();
    } finally {
      setVWC(handlingClose, false);
    }
  }, [onClose, handlingClose, content]);

  return (
    <div className={styles.container} ref={(r) => setVWC(containerRef, r)}>
      {label && (
        <div className={styles.labelContainer}>
          <div className={styles.label}>{label}</div>
        </div>
      )}
      {onClose !== undefined && (
        <RenderGuardedComponent
          props={onClose}
          component={(rawHandler) =>
            rawHandler === null ? (
              <></>
            ) : (
              <div className={styles.closeButtonContainer}>
                <div
                  className={combineClasses(
                    styles.closeButtonInnerContainer,
                    assumeDark ? styles.closeButtonInnerContainerAssumeDark : undefined
                  )}>
                  <RenderGuardedComponent
                    props={handlingClose}
                    component={(handling) => (
                      <IconButton
                        icon={styles.iconClose}
                        srOnlyName="Close"
                        onClick={(e) => {
                          e.preventDefault();
                          onCloseClick();
                        }}
                        spinning={handling}
                      />
                    )}
                  />
                </div>
              </div>
            )
          }
        />
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
                component={(desired) =>
                  !desired ? (
                    <></>
                  ) : (
                    <div className={styles.transcriptContainer}>
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
                  )
                }
              />
            )
          }
        />
        <div className={styles.controlsContainer}>
          <div className={styles.infoContainer}>
            {subtitle !== undefined && (
              <RenderGuardedComponent
                props={subtitle}
                component={(v) =>
                  v === null ? <></> : <div className={styles.instructor}>{v}</div>
                }
              />
            )}
            <RenderGuardedComponent
              props={title}
              component={(v) => <div className={styles.title}>{v}</div>}
            />
            {tag !== undefined && (
              <RenderGuardedComponent
                props={tag}
                component={(v) => (v === null ? <></> : <div className={styles.tag}>{v}</div>)}
              />
            )}
          </div>
          <div className={styles.buttonsContainer}>
            <div className={styles.buttonIconsRow}>
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
                    <button
                      className={styles.button}
                      type="button"
                      onClick={onClosedCaptioningClick}>
                      <RenderGuardedComponent
                        props={mediaInfo.closedCaptioning.enabled}
                        component={(desired) => (
                          <div
                            className={combineClasses(
                              styles.iconClosedCaptions,
                              desired ? undefined : styles.iconClosedCaptionsDisabled
                            )}
                          />
                        )}
                      />
                    </button>
                  )
                }
              />
            </div>
            {cta !== undefined && (
              <RenderGuardedComponent
                props={cta}
                component={(v) =>
                  v === null ? (
                    <></>
                  ) : (
                    <div className={styles.buttonCTARow}>
                      <RenderGuardedComponent
                        props={handlingCTA}
                        component={(handling) => (
                          <Button
                            type="button"
                            variant="outlined-white-thin"
                            onClick={(e) => {
                              e.preventDefault();
                              onCTAClick();
                            }}
                            spinner={handling}>
                            {v.title}
                            <div className={styles.arrow} />
                          </Button>
                        )}
                      />
                    </div>
                  )
                }
              />
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
    }, [props.phrase, props.currentTime])
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
    useCallback(
      (opacity) => {
        setVWC(target, { opacity }, (a, b) => a.opacity === b.opacity);
        return undefined;
      },
      [target]
    )
  );

  return (
    <div className={styles.transcriptPhrase} ref={ele}>
      {props.children}
    </div>
  );
};
