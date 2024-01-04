/**
 * Describes the minimum information required to reference a specific
 * image.
 */
export type OsehImageRef = {
  /** The uid of the image file */
  uid: string;
  /** A JWT which provides access to the image file */
  jwt: string;
};
