import { AspectRatioComparer } from './LogicalSize';

export type DisplaySize =
  | { displayWidth: number; displayHeight: number }
  | { displayWidth: number; displayHeight: null; compareAspectRatio: AspectRatioComparer }
  | { displayWidth: null; displayHeight: number; compareAspectRatio: AspectRatioComparer };

export type OsehImageProps = DisplaySize & {
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

  /**
   * If specified and true, the thumbhash is desired, not the actual image. If rendered,
   * only render the thumbhash.
   */
  thumbhashOnly?: boolean;
};

export type OsehImagePropsLoadable = OsehImageProps & { uid: string };
