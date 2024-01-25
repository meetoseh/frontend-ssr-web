export type OpenGraphMetaImage = {
  /**
   * URL where the image can be accessed
   */
  url: string;

  /**
   * Width of the image, in pixels
   */
  width: number;

  /**
   * Height of the image, in pixels
   */
  height: number;

  /**
   * MIME type of the image: https://en.wikipedia.org/wiki/Media_type
   * Usually image/jpeg or image/png
   */
  type: string;
};
