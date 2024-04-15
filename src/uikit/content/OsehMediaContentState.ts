import { ReactElement } from 'react';

export type OsehMediaContentStateLoading = {
  state: 'loading';
  loaded: false;
  error: null;
  element: null;
};

export type OsehMediaContentStateError = {
  state: 'error';
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
   * A convenience boolean which is true if the media is ready to be played.
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
