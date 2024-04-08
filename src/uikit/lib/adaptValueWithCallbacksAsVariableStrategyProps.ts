import { VariableStrategyProps } from '../anim/VariableStrategyProps';
import { ValueWithCallbacks } from './Callbacks';

/**
 * Adapts the given value with callbacks into the variable strategy props
 * interface.
 *
 * @param vwc The value with callbacks to adapt
 * @returns The variable strategy props backed by the given value with callbacks
 */
export const adaptValueWithCallbacksAsVariableStrategyProps = <T>(
  vwc: ValueWithCallbacks<T>
): VariableStrategyProps<T> => {
  return {
    type: 'callbacks',
    props: vwc.get,
    callbacks: vwc.callbacks,
  };
};
