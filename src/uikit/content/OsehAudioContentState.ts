import { ReactElement } from 'react';

/**
 * Describes a loading or loaded audio content file. This can be played or stopped.
 * On the web, playing or stopping requires a privileged context.
 */
export type OsehAudioContentState = {
  /**
   * A function that can be used to play the audio, if the audio is ready to
   * be played, otherwise null. Note that play() is privileged, meaning that
   * it must be called _immediately_ after a user interaction, after the audio
   * is loaded, or it will fail.
   */
  play: ((this: void) => Promise<void>) | null;

  /**
   * A function that can be used to stop the audio, if the audio is playing.
   */
  stop: ((this: void) => Promise<void>) | null;

  /**
   * A convenience boolean which is true if the audio is ready to be played.
   * This is equivalent to (play !== null), but more semantically meaningful.
   */
  loaded: boolean;

  /**
   * If an error occurred and this will never finish loading, this will be
   * an element describing the error. Otherwise, this will be null.
   */
  error: ReactElement | null;

  /**
   * A reference to the underlying audio element, if it has been created.
   * This is useful for more advanced use cases.
   */
  audio: HTMLAudioElement | null;
};
