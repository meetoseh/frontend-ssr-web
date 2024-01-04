import { useEffect, useState } from 'react';
import { OsehImageProps, OsehImagePropsLoadable } from './OsehImageProps';
import { OsehImageState } from './OsehImageState';
import { OsehImageStateRequestHandler } from './useOsehImageStateRequestHandler';

const createLoadingState = (props: OsehImageProps): OsehImageState => ({
  localUrl: null,
  displayWidth: props.displayWidth,
  displayHeight: props.displayHeight,
  alt: props.alt,
  loading: true,
  placeholderColor: props.placeholderColor,
});

/**
 * A hook for loading an image from oseh. This hook will load the playlist
 * for the given uid, and then select the best image to display based on
 * the displayWidth and displayHeight props as well as device characteristics,
 * such as DPI. This will then download the image, and if necessary, crop it
 * to the desired size before returning a URL to the corresponding blob via
 * the states localUrl property.
 *
 * If the props change in a way requiring a reload, e.g., the size changes,
 * this will reuse the old image state until the new image is available. This
 * avoids unnecessary splash screens, especially when resizing the window.
 * Prior to this change, components using the useState/useResources model
 * would typically unmount and remount when the window was resized as the
 * background image was reloaded, which could often have a visual impact
 * because of state within the component being reset.
 *
 * This hook will cause react rerenders as the state loads; to avoid this
 * in animation heavy components, prefer useOsehImageStateValueWithCallbacks
 * and OsehImageFromStateValueWithCallbacks, which never trigger rerenders
 *
 * @param props The props for the image to load; props do not need to be memoized.
 *   To disable loading, set the uid to null.
 * @param handler The handler to use for requests. This allows the resources
 *   required for generating images to be reused, i.e., the playlist or the
 *   original image or even the cropped image.
 * @returns The state of the image which can be used by OsehImageFromState
 */
export const useOsehImageState = (
  props: OsehImageProps,
  handler: OsehImageStateRequestHandler
): OsehImageState => {
  const [state, setState] = useState<[OsehImageProps, OsehImageState]>(() => [
    props,
    createLoadingState(props),
  ]);

  useEffect(() => {
    const cpProps: OsehImageProps = {
      uid: props.uid,
      jwt: props.jwt,
      displayWidth: props.displayWidth,
      displayHeight: props.displayHeight,
      alt: props.alt,
      isPublic: props.isPublic,
      placeholderColor: props.placeholderColor,
    };

    if (cpProps.uid === null) {
      setState((orig) => {
        const [p, s] = orig;
        if (p.uid !== null || s.localUrl !== null) {
          return [cpProps, createLoadingState(cpProps)];
        }
        return orig;
      });
      return;
    }
    const stateRef = handler.request(cpProps as OsehImagePropsLoadable);
    stateRef.stateChanged.add((s) => {
      updateState(s);
    });
    updateState(stateRef.state);
    return () => {
      stateRef.release();
    };

    function updateState(newState: OsehImageState) {
      setState((orig) => {
        const [p, s] = orig;
        if (newState.loading && !s.loading && p.uid === cpProps.uid) {
          return orig;
        }
        return [cpProps, newState];
      });
    }
  }, [
    props.uid,
    props.jwt,
    props.displayWidth,
    props.displayHeight,
    props.alt,
    props.isPublic,
    props.placeholderColor,
    handler,
  ]);

  return state[1];
};
