import { useMemo, useRef } from 'react';
import {
  ValueWithCallbacks,
  WritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../lib/Callbacks';
import { Animator, useAnimationLoop } from './AnimationLoop';
import { VariableStrategyProps } from './VariableStrategyProps';

/**
 * Given an initial value and a list of animators, returns a writable
 * value that can be used to set where you want the value to go towards
 * and a read-only value that represents the current value to render.
 *
 * This is a thin wrapper around useAnimationLoop generally used when
 * multiple render functions are desired. It's especially easy to work
 * with if you can use `useMappedValueWithCallbacksEffect` for the
 * individual render functions.
 *
 * @param initialValue The initial value for both the target and the
 *   rendered value. This value is only used once, regardless of react
 *   rerenders.
 * @param animators The animators to use to animate the value. If
 *   specified as a value it replaces the existing value every react
 *   rerender. If specified as a function, it is only called once and
 *   not rechecked regardless of changes.
 * @returns An object with two properties: `target` and `rendered`.
 *   `target` is a writable value that can be used to set the target
 *   value. `rendered` is a read-only value that represents the current
 *   value to render. Be aware that the backing object for rendered
 *   will be mutated, meaning if you need to keep old values around you
 *   will need to clone them.
 */
export const useAnimationTargetAndRendered = <T extends object>(
  initialValue: T | (() => T),
  animators: Animator<T>[] | (() => Animator<T>[])
): {
  target: WritableValueWithCallbacks<T>;
  rendered: ValueWithCallbacks<T>;
} => {
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

  const renderedAsVWC = useMemo(
    (): ValueWithCallbacks<T> => ({
      get: rendered,
      callbacks: renderedCallbacks,
    }),
    [rendered, renderedCallbacks]
  );

  return useMemo(
    () => ({
      target,
      rendered: renderedAsVWC,
    }),
    [target, renderedAsVWC]
  );
};
