import { ReactElement } from 'react';
import { OsehImageState } from './OsehImageState';

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
}: OsehImageState): ReactElement => {
  if (localUrl === null && placeholderColor !== undefined) {
    return (
      <div
        style={{ width: displayWidth, height: displayHeight, backgroundColor: placeholderColor }}
      />
    );
  }

  return (
    <img
      src={localUrl ?? undefined}
      style={{ width: displayWidth, height: displayHeight, objectFit: 'cover' }}
      alt={alt}
    />
  );
};
