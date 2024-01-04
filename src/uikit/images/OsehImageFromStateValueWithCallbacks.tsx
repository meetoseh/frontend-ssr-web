import { ReactElement, useEffect, useRef } from 'react';
import { ValueWithCallbacks } from '../lib/Callbacks';
import { OsehImageState } from './OsehImageState';

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
  state: ValueWithCallbacks<OsehImageState>;
}): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const container = containerRef.current;
    let rendering: OsehImageState | null = null;

    state.callbacks.add(rerender);
    rerender();
    return () => {
      state.callbacks.remove(rerender);
    };

    function rerender() {
      const val = Object.assign({}, state.get());

      if (rendering !== null && rendering.loading && val.loading) {
        updatePlaceholder(rendering, val);
        return;
      }

      if (rendering !== null && !rendering.loading && !val.loading) {
        updateImage(rendering, val);
        return;
      }

      reset();
      if (val.loading) {
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

    function setImageFromReset(current: OsehImageState) {
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.width = `${current.displayWidth}px`;
      container.style.height = `${current.displayHeight}px`;
      container.appendChild(
        (() => {
          const img = document.createElement('img');
          img.src = current.localUrl ?? require('../placeholder.png');
          img.style.width = `${current.displayWidth}px`;
          img.style.height = `${current.displayHeight}px`;
          img.style.objectFit = 'cover';
          return img;
        })()
      );
      rendering = current;
    }

    function updatePlaceholder(old: OsehImageState, current: OsehImageState) {
      if (old.displayWidth !== current.displayWidth) {
        container.style.width = `${current.displayWidth}px`;
      }
      if (old.displayHeight !== current.displayHeight) {
        container.style.height = `${current.displayHeight}px`;
      }
      if (old.placeholderColor !== current.placeholderColor) {
        container.style.backgroundColor = current.placeholderColor ?? '#FFFFFF';
      }
      rendering = current;
    }

    function updateImage(old: OsehImageState, current: OsehImageState) {
      const img: HTMLImageElement = container.children[0] as HTMLImageElement;

      if (old.displayWidth !== current.displayWidth) {
        container.style.width = `${current.displayWidth}px`;
        img.style.width = `${current.displayWidth}px`;
      }
      if (old.displayHeight !== current.displayHeight) {
        container.style.height = `${current.displayHeight}px`;
        img.style.height = `${current.displayHeight}px`;
      }
      if (old.localUrl !== current.localUrl) {
        img.src = current.localUrl ?? require('../placeholder.png');
      }
      rendering = current;
    }
  }, [state]);

  return <div ref={containerRef}></div>;
};
