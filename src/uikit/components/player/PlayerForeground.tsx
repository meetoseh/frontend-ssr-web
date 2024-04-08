import { CSSProperties, ReactElement, useCallback, useEffect, useRef } from 'react';
import { OsehMediaContentState } from '../../content/OsehMediaContentState';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../lib/Callbacks';
import { useMappedValueWithCallbacks } from '../../hooks/useMappedValueWithCallbacks';
import { OsehTranscriptResult } from '../../transcripts/useOsehTranscriptValueWithCallbacks';
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

  /**
   * The transcript for the media; this is ignored if "neverTranscript" is
   * set, which also slims the dom
   */
  transcript: ValueWithCallbacks<OsehTranscriptResult>;

  /** The title for the content, e.g., the name of the journey */
  title: string | ReactElement;

  /** If a subtitle should be rendered, e.g., the instructor name, the subtitle to render */
  subtitle?: string | ReactElement | undefined;

  /**
   * If the duration of the content is known in advance, this will be
   * used before its available from the media element.
   */
  durationSeconds?: number;

  /**
   * If a header, which is just the Oseh wordmark, should be rendered.
   * Default false.
   */
  header?: boolean;

  /**
   * If specified, adds a tag in the top-left containing this element/text.
   */
  label?: string | ReactElement;

  /**
   * If specified, the transcript is ignored and a small performance
   * improvement is made on the DOM.
   */
  neverTranscript?: boolean;
};

type ClosedCaptioningDesired = 'none' | 'small';
const CLOSED_CAPTIONING_DESIRED_VALUES: ClosedCaptioningDesired[] = ['none', 'small'];

const fadeTimeSeconds = 0.5;
const showEarlySeconds = fadeTimeSeconds;
const holdLateSeconds = 3 + fadeTimeSeconds;

/**
 * In order to prevent cc from shifting, we will move the end of a phrase
 * up to this much earlier to prevent it from overlapping with the start
 * of the next phrase
 */
const maximumAdjustmentToAvoidMultipleOnScreen = holdLateSeconds + 1;

/**
 * Displays the overlay for media, either an audio file or video file. Doesn't
 * handle the background image (for audio) or actually rendering the video (for
 * video)
 */
export const PlayerForeground = <T extends HTMLMediaElement>({
  size,
  content,
  transcript,
  durationSeconds,
  title,
  subtitle,
  label,
  header = false,
  neverTranscript = false,
}: PlayerForegroundProps<T>): ReactElement => {
  const durationSecondsVWC = useMappedValueWithCallbacks(content, (audio) => {
    return audio.element?.duration ?? durationSeconds ?? 0;
  });

  const totalTime = useMappedValueWithCallbacks(durationSecondsVWC, (durationSeconds) => {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);

    return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
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

  const adjustedTranscript = useMappedValueWithCallbacks(transcript, (t) => {
    if (t.type !== 'success' || t.transcript.phrases.length < 1) {
      return t;
    }

    const phrases = t.transcript.phrases;
    const adjustedPhrases = [];

    for (let i = 0; i < phrases.length - 1; i++) {
      const domEndOfThisPhrase = phrases[i].endsAt + holdLateSeconds;
      const domStartOfNextPhrase = phrases[i + 1].startsAt - showEarlySeconds;
      let adjustedEndsAt = phrases[i].endsAt;
      if (
        domEndOfThisPhrase > domStartOfNextPhrase &&
        domEndOfThisPhrase - domStartOfNextPhrase < maximumAdjustmentToAvoidMultipleOnScreen
      ) {
        adjustedEndsAt -= domEndOfThisPhrase - domStartOfNextPhrase;
        if (adjustedEndsAt < phrases[i].startsAt) {
          adjustedEndsAt = phrases[i].startsAt;
        }
      }
      adjustedPhrases.push({ ...phrases[i], endsAt: adjustedEndsAt });
    }
    adjustedPhrases.push(phrases[phrases.length - 1]);

    return {
      ...t,
      transcript: {
        ...t.transcript,
        phrases: adjustedPhrases,
      },
    };
  });

  const currentTranscriptPhrases = useMappedValuesWithCallbacks(
    [closedCaptioningDesired, adjustedTranscript, progressVWC, durationSecondsVWC],
    (): { phrase: OsehTranscriptPhrase; id: number }[] => {
      if (closedCaptioningDesired.get() === 'none') {
        return [];
      }

      const transcriptRaw = adjustedTranscript.get();
      if (transcriptRaw.type !== 'success') {
        return [];
      }

      const phrases = transcriptRaw.transcript.phrases;
      const progress = progressVWC.get();
      const durationSeconds = durationSecondsVWC.get();

      const progressSeconds = progress * durationSeconds;
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

  useValueWithCallbacksEffect(content, (content) => {
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

    if (content.element === null) {
      return;
    }
    const audio = content.element;
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
    const cont = content.get();

    if (cont.element === null) {
      return;
    }

    if (state === 'playing') {
      cont.element.pause();
    } else {
      cont.element.play();
    }
  }, []);

  const onMuteButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const cont = content.get();

    if (cont.element === null) {
      return;
    }

    cont.element.muted = !cont.element.muted;
    setVWC(muted, cont.element.muted);
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

  const progressAndDurationVWC = useMappedValuesWithCallbacks(
    [progressVWC, durationSecondsVWC],
    () => ({
      progress: progressVWC.get(),
      durationSeconds: durationSecondsVWC.get(),
    })
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
            props={audioState}
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
        {!neverTranscript && (
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
                          durationSeconds={durationSecondsVWC}
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
            {subtitle !== undefined && <div className={styles.instructor}>{subtitle}</div>}
            <div className={styles.title}>{title}</div>
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
            {!neverTranscript && (
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
              props={progressAndDurationVWC}
              component={({ durationSeconds, progress }) => {
                const inSeconds = Math.floor(durationSeconds * progress);
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
            props={totalTime}
            component={(totalTime) => <div className={styles.totalTime}>{totalTime}</div>}
          />
        </div>
      </div>
    </div>
  );
};

const TranscriptPhrase = (
  props: React.PropsWithChildren<{
    progress: ValueWithCallbacks<number>;
    durationSeconds: ValueWithCallbacks<number>;
    phrase: OsehTranscriptPhrase;
  }>
): ReactElement => {
  const ele = useRef<HTMLDivElement>(null);
  const opacityTarget = useMappedValuesWithCallbacks(
    [props.progress, props.durationSeconds],
    useCallback(() => {
      const progressSeconds = props.progress.get() * props.durationSeconds.get();
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
