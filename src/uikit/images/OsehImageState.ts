/**
 * The required state information to display an oseh image. Useful when you want
 * to use a single image in multiple places, as the standard OsehImage component
 * will refetch the image state every time
 */
export type OsehImageState = {
  /**
   * The local url where the image can be accessed
   */
  localUrl: string | null;

  /**
   * The thumbhash for the image, if known
   */
  thumbhash: string | null;

  /** The width in pixels to render the image at */
  displayWidth: number;

  /** The height in pixels to render the image at */
  displayHeight: number;

  /**
   * The alt text for the image
   */
  alt: string;

  /**
   * True if the image is loading, false otherwise
   */
  loading: boolean;

  /**
   * If a specific color should be used for the placeholder while loading,
   * this is the color. If not, this is null.
   */
  placeholderColor?: string;
};

export const areOsehImageStatesEqual = (a: OsehImageState, b: OsehImageState): boolean =>
  a === b ||
  (a.localUrl === b.localUrl &&
    a.thumbhash === b.thumbhash &&
    a.displayWidth === b.displayWidth &&
    a.displayHeight === b.displayHeight &&
    a.alt === b.alt &&
    a.loading === b.loading &&
    a.placeholderColor === b.placeholderColor);
