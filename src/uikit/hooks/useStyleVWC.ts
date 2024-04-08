import { ValueWithCallbacks } from '../lib/Callbacks';
import { useValuesWithCallbacksEffect } from './useValuesWithCallbacksEffect';

/**
 * Assigns the given style to the given ref
 */
export const useStyleVWC = <E extends HTMLElement, T extends object>(
  ref: ValueWithCallbacks<E | null>,
  style: ValueWithCallbacks<T>
): void => {
  useValuesWithCallbacksEffect([ref, style], () => {
    const ele = ref.get();
    if (ele === null) {
      return;
    }
    const s = style.get();
    Object.assign(ele.style, s);
    return undefined;
  });
};
