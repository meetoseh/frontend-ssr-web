import { useEffect } from 'react';
import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
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
 * Uses the given image props to produce an image state. This is analagous to
 * useOsehImageState, except the signature is modified to reduce the number
 * of react rerenders. Specifically, this will never trigger a react rerender.
 *
 * To render this state, use OsehImageFromStateValueWithCallbacks, which modifies
 * the dom directly and thus also doesn't trigger any react rerenders.
 *
 * It's generally not relevant which one is used unless the image state is being
 * lifted into a larger component (such as via a Feature implementation), in which
 * case it's very important for animation-heavy components to use this hook over
 * the react rerendering variation.
 *
 * @param props The image props to use to get the image state. If this value changes,
 *   in order to avoid react rerenders, it should be specified as a callbacks-style
 *   prop. Otherwise, standard react-rerender props are fine.
 * @param handler The handler to use for downloading images.
 */
export const useOsehImageStateValueWithCallbacks = (
  props: VariableStrategyProps<OsehImageProps>,
  handler: OsehImageStateRequestHandler
): ValueWithCallbacks<OsehImageState> => {
  const result = useWritableValueWithCallbacks<OsehImageState>(() =>
    createLoadingState(props.type === 'react-rerender' ? props.props : props.props())
  );

  const propsAsValueWithCallbacks = useVariableStrategyPropsAsValueWithCallbacks(props);

  useEffect(() => {
    let canceler: (() => void) | null = null;

    propsAsValueWithCallbacks.callbacks.add(handlePropsChanged);
    handlePropsChanged();

    return () => {
      propsAsValueWithCallbacks.callbacks.remove(handlePropsChanged);
      if (canceler) {
        canceler();
        canceler = null;
      }
    };

    function handlePropsChanged() {
      if (canceler) {
        canceler();
        canceler = null;
      }

      canceler = handleProps(propsAsValueWithCallbacks.get());
    }

    function handleProps(props: OsehImageProps): () => void {
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
        result.set(createLoadingState(cpProps));
        return () => {};
      }

      const stateRef = handler.request(cpProps as OsehImagePropsLoadable);
      stateRef.stateChanged.add(updateState);
      updateState(stateRef.state);
      return () => {
        stateRef.stateChanged.remove(updateState);
        stateRef.release();
      };

      function updateState(newState: OsehImageState) {
        result.set(newState);
        result.callbacks.call(undefined);
      }
    }
  }, [propsAsValueWithCallbacks, handler, result]);

  return result;
};
