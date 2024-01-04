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
   * The width we want to display the image at. The URL will be selected based on this.
   */
  displayWidth: number;

  /**
   * The height we want to display the image at. The URL will be selected based on this.
   */
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
