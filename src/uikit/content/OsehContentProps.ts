import { OsehContentRef } from './OsehContentRef';

/**
 * The information required to select a download target for a oseh content.
 * A video may have both audio-only and video exports, so that needs to be
 * known in order to select the right one. Furthermore, the content will
 * need authorization, which simple components might prefer to have handled
 * via presigned query parameters rather than via a bearer token.
 */
export type OsehContentProps = OsehContentRef & {
  /**
   * How the content file should be shown. Defaults to 'audio', meaning it
   * will be handled as audio-only content. For 'video', we may select a
   * different export and will show as a video.
   * @default 'audio'
   */
  showAs?: 'audio' | 'video';

  /**
   * True if the url needs presigning, false if the url does not need
   * presigning. Typically true if we want to use native controls and false if
   * we want to use custom controls.
   * @default true
   */
  presign?: boolean;
};
