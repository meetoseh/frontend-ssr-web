import { ReactElement } from 'react';
import { OsehImageProps } from './OsehImageProps';
import { OsehImageStateRequestHandler } from './useOsehImageStateRequestHandler';
import { useOsehImageState } from './useOsehImageState';
import { OsehImageFromState } from './OsehImageFromState';

/**
 * Creates a component which renders an Image for the given image file on oseh.
 * Image files from oseh come from a playlist with various image formats and
 * resolutions that are available, and this component will select the best
 * image to display based on the displayWidth and displayHeight props as well
 * as device characteristics, such as DPI.
 *
 * This is just a convenience component for useOsehImageState + OsehImageFromState,
 * and thus requires an image state request handler to be passed in. Passing
 * the same request handler to multiple components will allow for the most
 * efficient image loading.
 *
 * @param props The image to load and the handler to use
 * @returns The element to render
 */
export const OsehImage = (
  props: OsehImageProps & { handler: OsehImageStateRequestHandler }
): ReactElement => {
  const state = useOsehImageState(props, props.handler);
  return <OsehImageFromState {...state} />;
};
