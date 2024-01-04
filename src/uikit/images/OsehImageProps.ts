export type OsehImageProps = {
  /**
   * The uid of the oseh image file. If null, no image is loaded until
   * the uid is set.
   */
  uid: string | null;

  /**
   * The JWT which provides access to the image file. May only be null if not is_public
   */
  jwt: string | null;

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
   * If set and true, the jwt is ignored and we request this as a public file instead.
   */
  isPublic?: boolean;

  /**
   * If specified, used as the background color for the placeholder while the image
   * is loading
   */
  placeholderColor?: string;
};

export type OsehImagePropsLoadable = OsehImageProps & { uid: string };
