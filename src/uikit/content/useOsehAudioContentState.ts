import { useEffect } from 'react';
import { OsehAudioContentState } from './OsehAudioContentState';
import { OsehContentTarget } from './OsehContentTarget';
import { Callbacks, ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';

/**
 * Loads the specified audio target and returns a state object which can be used
 * to play or stop the audio. A loading or failed target will result in a perpetual
 * loading state.
 *
 * As the audio loads this can trigger several state changes; in order to mitigate
 * react rerenders, this returns a value with callbacks that should be unwrapped
 * with `useUnwrappedValueWithCallbacks` in the inner-most components that actually
 * care about the value, to instruct react on where rerenders are really necessary
 * (which is rarely the component calling this hook)
 */
export const useOsehAudioContentState = (
  targetVariableStrategy: VariableStrategyProps<OsehContentTarget>
): ValueWithCallbacks<OsehAudioContentState> => {
  const state = useWritableValueWithCallbacks<OsehAudioContentState>(() => ({
    play: null,
    stop: null,
    loaded: false,
    error: null,
    audio: null,
  }));
  const targetVWC = useVariableStrategyPropsAsValueWithCallbacks(targetVariableStrategy);

  useEffect(() => {
    let targetCanceler: (() => void) | null = null;
    targetVWC.callbacks.add(handleTargetChanged);
    handleTargetChanged();
    return () => {
      targetVWC.callbacks.remove(handleTargetChanged);
      if (targetCanceler !== null) {
        targetCanceler();
        targetCanceler = null;
      }
    };

    function handleTargetChanged() {
      if (targetCanceler !== null) {
        targetCanceler();
        targetCanceler = null;
      }

      targetCanceler = handleTarget(targetVWC.get()) ?? null;
    }

    function handleTarget(outerTarget: OsehContentTarget): (() => void) | undefined {
      if (outerTarget.state !== 'loaded') {
        state.set({
          play: null,
          stop: null,
          loaded: false,
          error: null,
          audio: null,
        });
        state.callbacks.call(undefined);
        return;
      }
      const target = outerTarget;

      const audioSrc =
        target.webExport.url + (target.presigned ? '' : `?jwt=${encodeURIComponent(target.jwt)}`);

      let aud = state.get().audio;
      if (aud !== null && aud.src !== audioSrc) {
        aud = null;
      }

      if (aud === null) {
        aud = new Audio();
        aud.preload = 'auto';
        aud.src = audioSrc;
      }

      const audio = aud;

      let active = true;
      const unmount = () => {
        if (!active) {
          return;
        }
        active = false;
      };
      manageAudio();
      return unmount;

      async function manageAudio() {
        if (state.get().audio === audio && state.get().loaded) {
          return;
        }

        if (!audio.paused) {
          audio.pause();
        }

        state.set({
          play: null,
          stop: null,
          loaded: false,
          error: null,
          audio,
        });
        state.callbacks.call(undefined);

        const onLoadPromise = new Promise<void>((resolve) => {
          const cancelers = new Callbacks<undefined>();

          if (audio.readyState >= 4) {
            cancelers.call(undefined);
            resolve();
            return;
          }

          const onLoaded = () => {
            cancelers.call(undefined);
            resolve();
          };

          const onPotentiallyResolvableIssue = () => {
            if (didResetLoad) {
              cancelers.call(undefined);
              resolve();
            } else {
              resetLoad();
            }
          };

          const onRecheckNetworkStateTimeout = () => {
            recheckNetworkStateTimeout = null;

            if (audio.networkState !== 2) {
              if (didResetLoad) {
                cancelers.call(undefined);
                resolve();
              } else {
                resetLoad();
              }
            } else {
              recheckNetworkStateTimeout = setTimeout(onRecheckNetworkStateTimeout, 100);
            }
          };

          cancelers.add(() => audio.removeEventListener('canplaythrough', onLoaded));
          cancelers.add(() => audio.removeEventListener('suspend', onPotentiallyResolvableIssue));
          cancelers.add(() => audio.removeEventListener('stalled', onPotentiallyResolvableIssue));
          cancelers.add(() => audio.removeEventListener('error', onPotentiallyResolvableIssue));
          audio.addEventListener('canplaythrough', onLoaded);
          audio.addEventListener('suspend', onPotentiallyResolvableIssue);
          audio.addEventListener('stalled', onPotentiallyResolvableIssue);
          audio.addEventListener('error', onPotentiallyResolvableIssue);

          let recheckNetworkStateTimeout: NodeJS.Timeout | null = setTimeout(
            onRecheckNetworkStateTimeout,
            100
          );
          cancelers.add(() => {
            if (recheckNetworkStateTimeout !== null) {
              clearTimeout(recheckNetworkStateTimeout);
              recheckNetworkStateTimeout = null;
            }
          });

          let didResetLoad = false;
          const resetLoad = () => {
            if (didResetLoad) {
              return;
            }
            didResetLoad = true;

            if (audio.networkState === 3) {
              audio.src = audioSrc;
            }
            let timeout: NodeJS.Timeout | null = null;
            cancelers.add(() => {
              if (timeout !== null) {
                clearTimeout(timeout);
                timeout = null;
              }
            });

            const onLoadStart = () => {
              if (timeout !== null) {
                clearTimeout(timeout);
              }
            };

            timeout = setTimeout(() => {
              timeout = null;
              cancelers.call(undefined);
              resolve();
            }, 250);

            cancelers.add(() => audio.removeEventListener('loadstart', onLoadStart));
            audio.addEventListener('loadstart', onLoadStart);
            audio.load();
          };

          if (audio.networkState !== 2) {
            resetLoad();
          }
        });

        await onLoadPromise;
        if (!active) {
          return;
        }

        state.set({
          play: () => audio.play(),
          stop: async () => audio.pause(),
          loaded: true,
          error: null,
          audio,
        });
        state.callbacks.call(undefined);
        unmount();
      }
    }
  }, [targetVWC, state]);

  return state;
};
