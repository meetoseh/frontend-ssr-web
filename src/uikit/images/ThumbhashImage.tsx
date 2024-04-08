import { thumbHashToDataURL } from 'thumbhash';
import { base64URLToByteArray } from '../lib/colorUtils';
import { ReactElement, useMemo } from 'react';
import { BorderRadius, convertBorderRadiusToStyle } from '../lib/BorderRadius';

export type ThumbhashImageProps = {
  /** The thumbhash, base64url encoded */
  thumbhash: string;
  /** The width to render the image at */
  width: number;
  /** The height to render the image at */
  height: number;
  /** Alt text for the image */
  alt: string;
  /** The border radius for the image, or undefined for rectangular */
  borderRadius?: BorderRadius;
};

export const ThumbhashImage = ({
  thumbhash,
  width,
  height,
  alt,
  borderRadius,
}: ThumbhashImageProps): ReactElement => {
  const dataUrl = useMemo(() => thumbHashToDataURL(base64URLToByteArray(thumbhash)), [thumbhash]);

  return (
    <img
      src={dataUrl}
      width={width}
      height={height}
      alt={alt}
      style={convertBorderRadiusToStyle(borderRadius)}
    />
  );
};
