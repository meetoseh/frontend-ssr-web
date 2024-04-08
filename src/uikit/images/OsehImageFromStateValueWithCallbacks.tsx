import { ReactElement, useEffect, useRef } from 'react';
import { ValueWithCallbacks } from '../lib/Callbacks';
import { OsehImageState } from './OsehImageState';
import { thumbHashToDataURL } from 'thumbhash';
import { base64URLToByteArray } from '../lib/colorUtils';
import { PLACEHOLDER_DATA_URL } from '../lib/PlaceholderDataURL';
import { BorderRadius, convertBorderRadiusToStyle } from '../lib/BorderRadius';

/**
 * Renders a single image state specified as a ValueWithCallbacks. This will
 * never trigger rerenders and does not require that the parent component
 * rerender. In animation-heavy components or when image state has been lifted
 * such as in Features, this is a significant performance improvement compared to
 * OsehImageFromState.
 *
 * For example, if clicking a button plays an animation and loads an image, the
 * animation could be completely untenable if the image is loaded using
 * useOsehImageState, as during the phases of the image loading it will cause
 * react rerenders which will stall the animation. This is particularly true
 * on mobile devices or high-frequency displays. In general, there should be no
 * react rerenders while animating, but delaying image loading until after the
 * animation is also undesirable: the animation is meant to hide the loading
 * times!
 */
export const OsehImageFromStateValueWithCallbacks = ({
  state,
}: {
  state: ValueWithCallbacks<
    OsehImageState & {
      borderRadius?: BorderRadius;
    }
  >;
}): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const container = containerRef.current;
    let rendering: (OsehImageState & { thumbhashUrl?: string }) | null = null;

    state.callbacks.add(rerender);
    rerender();
    return () => {
      state.callbacks.remove(rerender);
    };

    function rerender() {
      const val: OsehImageState & { borderRadius?: BorderRadius; thumbhashUrl?: string } =
        Object.assign({}, state.get());

      if (
        rendering !== null &&
        rendering.thumbhash !== null &&
        rendering.thumbhash === val.thumbhash
      ) {
        val.thumbhashUrl = rendering.thumbhashUrl;
      }

      if (
        rendering !== null &&
        rendering.loading &&
        rendering.thumbhash === null &&
        val.loading &&
        val.thumbhash === null
      ) {
        updatePlaceholder(rendering, val);
        return;
      }

      if (
        rendering !== null &&
        (!rendering.loading || rendering.thumbhash !== null) &&
        (!val.loading || val.thumbhash !== null)
      ) {
        updateImage(rendering, val);
        return;
      }

      reset();
      if (val.loading && val.thumbhash === null) {
        setPlaceholderFromReset(val);
      } else {
        setImageFromReset(val);
      }
    }

    function reset() {
      container.textContent = '';
      container.removeAttribute('style');
      rendering = null;
    }

    function setPlaceholderFromReset(current: OsehImageState) {
      container.style.width = `${current.displayWidth}px`;
      container.style.height = `${current.displayHeight}px`;
      container.style.backgroundColor = current.placeholderColor ?? '#FFFFFF';
      rendering = current;
    }

    function setImageFromReset(current: OsehImageState & { thumbhashUrl?: string }) {
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.width = `${current.displayWidth}px`;
      container.style.height = `${current.displayHeight}px`;
      container.appendChild(
        (() => {
          const img = document.createElement('img');
          img.src = getImageUrl(current) ?? PLACEHOLDER_DATA_URL;
          img.style.width = `${current.displayWidth}px`;
          img.style.height = `${current.displayHeight}px`;
          img.style.objectFit =
            current.localUrl === null && current.thumbhash !== null ? 'fill' : 'cover';
          return img;
        })()
      );
      rendering = current;
    }

    function updatePlaceholder(
      old: OsehImageState,
      current: OsehImageState & { borderRadius?: BorderRadius }
    ) {
      if (old.displayWidth !== current.displayWidth) {
        container.style.width = `${current.displayWidth}px`;
      }
      if (old.displayHeight !== current.displayHeight) {
        container.style.height = `${current.displayHeight}px`;
      }
      if (old.placeholderColor !== current.placeholderColor) {
        container.style.backgroundColor = current.placeholderColor ?? '#FFFFFF';
      }
      Object.assign(container.style, convertBorderRadiusToStyle(current.borderRadius));
      rendering = current;
    }

    function updateImage(
      old: OsehImageState & { thumbhashUrl?: string; borderRadius?: BorderRadius },
      current: OsehImageState & { thumbhashUrl?: string; borderRadius?: BorderRadius }
    ) {
      const img: HTMLImageElement = container.children[0] as HTMLImageElement;

      if (old.displayWidth !== current.displayWidth) {
        container.style.width = `${current.displayWidth}px`;
        img.style.width = `${current.displayWidth}px`;
      }
      if (old.displayHeight !== current.displayHeight) {
        container.style.height = `${current.displayHeight}px`;
        img.style.height = `${current.displayHeight}px`;
      }
      Object.assign(container.style, convertBorderRadiusToStyle(current.borderRadius));
      const oldUrl = getImageUrl(old);
      const newUrl = getImageUrl(current);

      if (oldUrl !== newUrl) {
        img.src = newUrl ?? PLACEHOLDER_DATA_URL;
        img.style.objectFit =
          current.localUrl === null && current.thumbhash !== null ? 'fill' : 'cover';
      }
      rendering = current;
    }

    function getImageUrl(state: OsehImageState & { thumbhashUrl?: string }): string | null {
      if (state.localUrl !== null) {
        return state.localUrl;
      }

      if (state.thumbhashUrl !== undefined) {
        return state.thumbhashUrl;
      }

      if (state.thumbhash !== null) {
        state.thumbhashUrl = thumbHashToDataURL(base64URLToByteArray(state.thumbhash));
        return state.thumbhashUrl;
      }

      return null;
    }
  }, [state]);

  return <div ref={containerRef}></div>;
};
