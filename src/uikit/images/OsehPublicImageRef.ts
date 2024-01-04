/**
 * Describes the minimum information required to reference a specific
 * public image.
 */
export type OsehPublicImageRef = {
  /** The uid of the image file */
  uid: string;
  /** The value null, to indicate the image is public */
  jwt: null;
};
