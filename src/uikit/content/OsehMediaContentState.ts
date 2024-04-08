import { ReactElement } from 'react';

export type OsehMediaContentStateLoading = {
  state: 'loading';
  play: null;
  stop: null;
  loaded: false;
  error: null;
  element: null;
};

export type OsehMediaContentStateError = {
  state: 'error';
  play: null;
  stop: null;
  loaded: false;
  /**
   * An element describing the error that occurred while loading the audio or video.
   */
  error: ReactElement;
  element: null;
};

export type OsehMediaContentStateLoaded<T extends HTMLMediaElement> = {
  state: 'loaded';
  /**
   * A function that can be used to play the media, if the media is ready to
   * be played, otherwise null. Note that play() is privileged, meaning that
   * it must be called _immediately_ after a user interaction
   */
  play: (this: void) => Promise<void>;

  /**
   * A function that can be used to stop the media, if the media is playing.
   */
  stop: (this: void) => Promise<void>;

  /**
   * A convenience boolean which is true if the media is ready to be played.
   * This is equivalent to (play !== null), but more semantically meaningful.
   */
  loaded: true;

  error: null;

  /**
   * A reference to the underlying media element. This needs to be rendered, and
   * is useful for more advanced use cases.
   */
  element: T;
};

/**
 * Describes a loading or loaded content file. This can be played or stopped.
 * On the web, playing or stopping requires a privileged context.
 */
export type OsehMediaContentState<T extends HTMLMediaElement> =
  | OsehMediaContentStateLoading
  | OsehMediaContentStateError
  | OsehMediaContentStateLoaded<T>;
