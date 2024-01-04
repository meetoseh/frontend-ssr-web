import { MutableRefObject, useEffect, useMemo, useRef } from 'react';
import { WritableValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { Animator, useAnimationLoop } from './AnimationLoop';
import { VariableStrategyProps } from './VariableStrategyProps';

/**
 * Creates a new writable value with callbacks and uses it to push
 * changes to an animation loop powered by the given render function.
 *
 * This is a basic wrapper around useAnimationLoop for when a render
 * function is convenient. If it's instead better to use a bunch of
 * smaller render functions it may be simpler to work with
 * useAnimationTargetAndRendered instead.
 *
 * @param initialValue The initial state to render the component with.
 * @param animators The animators to use to animate the value. If specified
 *   as a function the function is only ever called once and the returned
 *   value is used for the lifetime of the component. If specified directly
 *   as an array, the value must be memoized.
 * @param render The function which can take a state value and render it,
 *   called once per frame when awake (see `useAnimationLoop`)
 * @param current If specified, we write the currently rendered value to
 *   this VWC. Often helpful for ensuring state is kept across react rerenders.
 *   These values are not immutable, so be aware that you may need to copy.
 */
export const useAnimatedValueWithCallbacks = <T extends object>(
  initialValue: T | (() => T),
  animators: Animator<T>[] | (() => Animator<T>[]),
  render: (value: T) => void,
  current?: WritableValueWithCallbacks<T>
): WritableValueWithCallbacks<T> => {
  const target = useWritableValueWithCallbacks(() => {
    if (typeof initialValue === 'function') {
      return initialValue();
    }
    return initialValue;
  });
  const targetAsVariableStrategyProps = useMemo<VariableStrategyProps<T>>(
    () => ({
      type: 'callbacks',
      props: () => target.get(),
      callbacks: target.callbacks,
    }),
    [target]
  );

  const animatorsRef = useRef<Animator<T>[]>();
  if (typeof animators === 'function') {
    if (animatorsRef.current === undefined) {
      animatorsRef.current = animators();
    }
  } else {
    animatorsRef.current = animators;
  }

  const [rendered, renderedCallbacks] = useAnimationLoop(
    targetAsVariableStrategyProps,
    animatorsRef.current
  );

  const renderRef = useRef<(value: T) => void>() as MutableRefObject<(value: T) => void>;
  renderRef.current = render;

  useEffect(() => {
    renderedCallbacks.add(doRender);
    doRender();
    return () => {
      renderedCallbacks.remove(doRender);
    };

    function doRender() {
      const now = rendered();
      renderRef.current(now);

      if (current !== undefined) {
        current.set(now);
        current.callbacks.call(undefined);
      }
    }
  }, [current, rendered, renderedCallbacks]);

  return target;
};
