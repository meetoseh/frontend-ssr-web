import { ReactElement } from 'react';
import { OsehContentTarget } from './OsehContentTarget';
import {
  Callbacks,
  ValueWithCallbacks,
  createWritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../lib/Callbacks';
import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';
import {
  OsehMediaContentState,
  OsehMediaContentStateError,
  OsehMediaContentStateLoaded,
  OsehMediaContentStateLoading,
} from './OsehMediaContentState';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { describeError } from '../components/ErrorBlock';

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
): ValueWithCallbacks<OsehMediaContentState<HTMLAudioElement>> => {
  const targetVWC = useVariableStrategyPropsAsValueWithCallbacks(targetVariableStrategy);
  const result = useWritableValueWithCallbacks<OsehMediaContentState<HTMLAudioElement>>(() =>
    makeLoadingState()
  );

  useValueWithCallbacksEffect(targetVWC, (outerTarget) => {
    setVWC(result, makeLoadingState(), (a, b) => a.state === b.state);
    if (outerTarget.state !== 'loaded') {
      return;
    }
    const target = outerTarget;

    const activeVWC = createWritableValueWithCallbacks(true);
    fetchAudio();
    return () => {
      setVWC(activeVWC, false);
    };

    async function fetchAudio() {
      if (!activeVWC.get()) {
        return;
      }

      const audioSrc =
        target.webExport.url + (target.presigned ? '' : `?jwt=${encodeURIComponent(target.jwt)}`);

      const audio = new Audio();
      audio.preload = 'auto';
      audio.autoplay = false;
      audio.src = audioSrc;

      const onLoadPromise = new Promise<void>((resolve, reject) => {
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

        const onError = (e: ErrorEvent) => {
          if (didResetLoad) {
            cancelers.call(undefined);
            reject(e);
          } else {
            resetLoad();
          }
        };

        const onCancelRequested = () => {
          cancelers.call(undefined);
          resolve();
          audio.src = '';
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
        cancelers.add(() => audio.removeEventListener('error', onError));
        cancelers.add(() => activeVWC.callbacks.remove(onCancelRequested));
        audio.addEventListener('canplaythrough', onLoaded);
        audio.addEventListener('suspend', onPotentiallyResolvableIssue);
        audio.addEventListener('stalled', onPotentiallyResolvableIssue);
        audio.addEventListener('error', onError);
        activeVWC.callbacks.add(onCancelRequested);

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

        if (!activeVWC.get()) {
          onCancelRequested();
        }
      });

      try {
        await onLoadPromise;
      } catch (e) {
        if (!activeVWC.get()) {
          return;
        }

        const err = await describeError(e);
        if (activeVWC.get()) {
          setVWC(result, makeErrorState(err), () => false);
        }
        return;
      }
      if (!activeVWC.get()) {
        return;
      }

      setVWC(
        result,
        makeLoadedState(
          () => audio.play(),
          async () => audio.pause(),
          audio
        ),
        () => false
      );
    }
  });

  return result;
};

const makeLoadingState = (): OsehMediaContentStateLoading => ({
  state: 'loading',
  play: null,
  stop: null,
  loaded: false,
  error: null,
  element: null,
});

const makeErrorState = (error: ReactElement): OsehMediaContentStateError => ({
  state: 'error',
  play: null,
  stop: null,
  loaded: false,
  error,
  element: null,
});

const makeLoadedState = (
  play: (this: void) => Promise<void>,
  stop: (this: void) => Promise<void>,
  audio: HTMLAudioElement
): OsehMediaContentStateLoaded<HTMLAudioElement> => ({
  state: 'loaded',
  play,
  stop,
  loaded: true,
  error: null,
  element: audio,
});
