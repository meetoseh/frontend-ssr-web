import { useCallback, useMemo } from 'react';
import {
  ValueWithCallbacks,
  WritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../lib/Callbacks';
import { OsehTranscriptPhrase } from '../transcripts/OsehTranscript';
import { useMappedValueWithCallbacks } from './useMappedValueWithCallbacks';
import { useValueWithCallbacksEffect } from './useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { useMappedValuesWithCallbacks } from './useMappedValuesWithCallbacks';
import { OsehMediaContentState } from '../content/OsehMediaContentState';
import { UseCurrentTranscriptPhrasesResult } from '../transcripts/useCurrentTranscriptPhrases';

export type MediaInfo = {
  /** True if the video is ready to play, false otherwise */
  loaded: ValueWithCallbacks<boolean>;
  /** True if the video is currently playing, false if paused */
  playing: ValueWithCallbacks<boolean>;
  /** Inverted playing; true if currently paused, false if playing */
  paused: ValueWithCallbacks<boolean>;
  /** True if the video is software muted, false if not software muted */
  muted: ValueWithCallbacks<boolean>;
  /** The current playback time in seconds */
  currentTime: ValueWithCallbacks<number>;
  /** The video progress, which is the current time over the total time in seconds, or 0 if duration is not loaded */
  progress: ValueWithCallbacks<number>;
  /** The combination of loaded and playing as a string enum, usually for the play button */
  playPauseState: ValueWithCallbacks<'playing' | 'paused' | 'loading' | 'errored'>;
  /** If the video is at the end and hasn't started again */
  ended: ValueWithCallbacks<boolean>;
  /** Closed captioning information */
  closedCaptioning: {
    /** The phrases to render */
    phrases: ValueWithCallbacks<{ phrase: OsehTranscriptPhrase; id: number }[]>;
    /** If closed captioning is actually available (vs always empty phrases) */
    available: ValueWithCallbacks<boolean>;
    /** Can be written to to enable/disable closed captioning */
    enabled: WritableValueWithCallbacks<boolean>;
    /** The combined available and enabled booleans */
    state: ValueWithCallbacks<{ enabled: boolean; available: boolean }>;
  };
  /** The total duration of the video in seconds, and formatted for display */
  totalTime: ValueWithCallbacks<{ seconds?: number; formatted: string }>;
};

/**
 * Convenience hook for extracting all the common information about a video
 * into the most consumable form.
 *
 * This will handle setting the current time for the current transcript
 * phrases.
 */
export const useMediaInfo = <T extends HTMLMediaElement>({
  mediaVWC,
  currentTranscriptPhrasesVWC,
  durationSeconds,
}: {
  /**
   * The media to load the video information from
   */
  mediaVWC: ValueWithCallbacks<OsehMediaContentState<T>>;

  /**
   * We sync the current video time with the transcript phrases, plus we
   * use this for determining if closed captioning is available.
   */
  currentTranscriptPhrasesVWC: ValueWithCallbacks<UseCurrentTranscriptPhrasesResult>;

  /**
   * If the duration of the media is known out of band, it can be provided
   * and will be used when the medias metadata is not available.
   */
  durationSeconds?: number;
}): MediaInfo => {
  const videoLoadedVWC = useMappedValueWithCallbacks(mediaVWC, (v) => v.loaded);
  const videoPlayingVWC = useWritableValueWithCallbacks(() => false);
  const videoPausedVWC = useMappedValueWithCallbacks(videoPlayingVWC, (v) => !v);
  const videoMutedVWC = useWritableValueWithCallbacks(() => false);
  const videoCurrentTimeVWC = useWritableValueWithCallbacks(() => 0);
  const videoTotalTimeVWC = useWritableValueWithCallbacks<{ seconds?: number; formatted: string }>(
    () =>
      durationSeconds === undefined
        ? { formatted: '?:??' }
        : {
            seconds: durationSeconds,
            formatted: formatSeconds(durationSeconds),
          }
  );
  const videoEndedVWC = useWritableValueWithCallbacks(() => false);
  const videoErroredVWC = useWritableValueWithCallbacks(() => false);

  useValueWithCallbacksEffect(
    mediaVWC,
    useCallback(
      (v) => {
        if (v.state !== 'loaded') {
          return;
        }
        const vid = v.element;
        vid.addEventListener('play', handlePausedChanged);
        vid.addEventListener('pause', handlePausedChanged);
        vid.addEventListener('ended', handleEnded);
        vid.addEventListener('volumechange', handleMutedChanged);
        vid.addEventListener('timeupdate', handleTimeChanged);
        vid.addEventListener('loadedmetadata', handleMetadataChanged);
        vid.addEventListener('durationchange', handleMetadataChanged);
        vid.addEventListener('error', handleError);
        handlePausedChanged();
        handleMutedChanged();
        handleMetadataChanged();
        return () => {
          vid.removeEventListener('play', handlePausedChanged);
          vid.removeEventListener('pause', handlePausedChanged);
          vid.removeEventListener('ended', handleEnded);
          vid.removeEventListener('volumechange', handleMutedChanged);
          vid.removeEventListener('timeupdate', handleTimeChanged);
          vid.removeEventListener('loadedmetadata', handleMetadataChanged);
          vid.removeEventListener('durationchange', handleMetadataChanged);
          vid.removeEventListener('error', handleError);
        };

        function handlePausedChanged() {
          if (vid.paused && vid.ended) {
            // pause event can sometimes be issued before ended, but no
            // matter what it's convenient if we set ended first so we
            // don't store "fake" pause events in in-app sessions
            setVWC(videoEndedVWC, true);
          }

          const playing = !vid.paused && !vid.ended;
          setVWC(videoPlayingVWC, playing);
          if (playing) {
            setVWC(videoEndedVWC, false);
          }
          setVWC(videoErroredVWC, vid.error !== null);
        }

        function handleEnded() {
          setVWC(videoEndedVWC, true);
          handlePausedChanged();
        }

        function handleMutedChanged() {
          setVWC(videoMutedVWC, vid.muted);
        }

        function handleTimeChanged() {
          setVWC(videoCurrentTimeVWC, vid.currentTime);
        }

        function handleMetadataChanged() {
          const durationRaw = vid.duration;
          const duration =
            durationRaw === undefined ||
            isNaN(durationRaw) ||
            !isFinite(durationRaw) ||
            durationRaw <= 0
              ? durationSeconds
              : durationRaw;
          if (duration === undefined) {
            setVWC(
              videoTotalTimeVWC,
              { formatted: '?:??' },
              (a, b) => a.formatted === b.formatted && a.seconds === b.seconds
            );
          }

          setVWC(
            videoTotalTimeVWC,
            {
              seconds: vid.duration,
              formatted: formatSeconds(vid.duration),
            },
            (a, b) => a.formatted === b.formatted && a.seconds === b.seconds
          );

          setVWC(videoErroredVWC, vid.error !== null);
        }

        function handleError() {
          setVWC(videoErroredVWC, true);
        }
      },
      [videoEndedVWC, videoPlayingVWC, videoMutedVWC, videoCurrentTimeVWC, videoTotalTimeVWC]
    )
  );
  const videoPlayPauseStateVWC = useMappedValuesWithCallbacks(
    [videoErroredVWC, videoLoadedVWC, videoPlayingVWC],
    (): 'loading' | 'playing' | 'paused' | 'errored' => {
      if (videoPlayingVWC.get()) {
        return 'playing';
      }
      if (videoErroredVWC.get()) {
        return 'errored';
      }
      if (!videoLoadedVWC.get()) {
        return 'loading';
      }
      return 'paused';
    }
  );

  const closedCaptioningPhrasesVWC = useMappedValueWithCallbacks(
    currentTranscriptPhrasesVWC,
    (v) => v.phrases
  );
  const closedCaptioningAvailableVWC = useMappedValueWithCallbacks(
    currentTranscriptPhrasesVWC,
    (v) => {
      return v.type !== 'unavailable';
    }
  );
  const closedCaptioningEnabledVWC = useWritableValueWithCallbacks(() => true);

  const closedCaptioningStateVWC = useMappedValuesWithCallbacks(
    [closedCaptioningAvailableVWC, closedCaptioningEnabledVWC],
    () => ({
      available: closedCaptioningAvailableVWC.get(),
      enabled: closedCaptioningEnabledVWC.get(),
    }),
    {
      outputEqualityFn: (a, b) => a.available === b.available && a.enabled === b.enabled,
    }
  );

  useValueWithCallbacksEffect(videoCurrentTimeVWC, (currentTime) => {
    setVWC(currentTranscriptPhrasesVWC.get().currentTime, currentTime);
    return undefined;
  });

  const progressVWC = useMappedValuesWithCallbacks([videoCurrentTimeVWC, videoTotalTimeVWC], () => {
    const currentTime = videoCurrentTimeVWC.get();
    const totalTime = videoTotalTimeVWC.get();
    if (totalTime.seconds === undefined || totalTime.seconds <= 0) {
      return 0;
    }
    return currentTime / totalTime.seconds;
  });

  return useMemo(
    () => ({
      loaded: videoLoadedVWC,
      playing: videoPlayingVWC,
      paused: videoPausedVWC,
      muted: videoMutedVWC,
      currentTime: videoCurrentTimeVWC,
      progress: progressVWC,
      playPauseState: videoPlayPauseStateVWC,
      ended: videoEndedVWC,
      closedCaptioning: {
        phrases: closedCaptioningPhrasesVWC,
        available: closedCaptioningAvailableVWC,
        enabled: closedCaptioningEnabledVWC,
        state: closedCaptioningStateVWC,
      },
      totalTime: videoTotalTimeVWC,
    }),
    [
      videoLoadedVWC,
      videoPlayingVWC,
      videoPausedVWC,
      videoMutedVWC,
      videoCurrentTimeVWC,
      progressVWC,
      videoPlayPauseStateVWC,
      videoEndedVWC,
      currentTranscriptPhrasesVWC,
      closedCaptioningPhrasesVWC,
      closedCaptioningAvailableVWC,
      closedCaptioningEnabledVWC,
      closedCaptioningStateVWC,
      videoTotalTimeVWC,
    ]
  );
};

const formatSeconds = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);

  return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
};
