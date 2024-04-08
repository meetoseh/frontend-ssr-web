import { ReactElement } from 'react';
import { OsehImageState } from './OsehImageState';
import { ThumbhashImage } from './ThumbhashImage';
import { PLACEHOLDER_DATA_URL } from '../lib/PlaceholderDataURL';
import { BorderRadius, convertBorderRadiusToStyle } from '../lib/BorderRadius';

/**
 * Creates a component which renders an image whose state has already been loaded
 * as if by useOsehImageState.
 *
 * @returns The element to render
 */
export const OsehImageFromState = ({
  localUrl,
  displayWidth,
  displayHeight,
  alt,
  placeholderColor,
  thumbhash,
  borderRadius,
}: OsehImageState & {
  borderRadius?: BorderRadius;
}): ReactElement => {
  if (localUrl === null && placeholderColor !== undefined) {
    return (
      <div
        style={Object.assign(
          { width: displayWidth, height: displayHeight, backgroundColor: placeholderColor },
          convertBorderRadiusToStyle(borderRadius)
        )}
      />
    );
  }

  if (localUrl === null && thumbhash !== null) {
    return (
      <ThumbhashImage
        thumbhash={thumbhash}
        width={displayWidth}
        height={displayHeight}
        alt={alt}
        borderRadius={borderRadius}
      />
    );
  }

  return (
    <img
      src={localUrl ?? PLACEHOLDER_DATA_URL}
      style={Object.assign(
        { width: displayWidth, height: displayHeight, objectFit: 'cover' },
        convertBorderRadiusToStyle(borderRadius)
      )}
      alt={alt}
    />
  );
};
