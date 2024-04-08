import { isValidElement, useCallback } from 'react';
import { useValuesWithCallbacksEffect } from '../hooks/useValuesWithCallbacksEffect';
import { Callbacks, ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { OsehContentRef } from './OsehContentRef';
import { ContentFileWebExport, OsehContentTarget } from './OsehContentTarget';
import { setVWC } from '../lib/setVWC';
import { fetchWebExport } from './useOsehContentTarget';
import { MakePropsNotNull } from '../lib/MakePropsNotNull';
import { describeError } from '../components/ErrorBlock';

export type UseOsehContentTargetValueWithCallbacksProps = {
  /**
   * The ref that you want to fetch
   */
  ref: ValueWithCallbacks<OsehContentRef | null>;
  /**
   * Compares different exports by returning a negative number if a
   * is better, a positive number if b is better, and 0 if they are
   * equivalent.
   *
   * Must result in a total order for predictable behavior (i.e,.
   * reflexive, antisymmetric, transitive)
   */
  comparer: ValueWithCallbacks<(a: ContentFileWebExport, b: ContentFileWebExport) => number>;
  /**
   * True if the result should be presigned, i.e., the URL should
   * include the required access token, false if the the URL does
   * not include access parameters and thus requires that they are
   * set in headers
   */
  presign: boolean;
};

/**
 * Fetches the content target for the given content ref in
 * a value with callbacks.
 */
export const useOsehContentTargetValueWithCallbacks = ({
  ref: refVWC,
  comparer: comparerVWC,
  presign,
}: UseOsehContentTargetValueWithCallbacksProps): ValueWithCallbacks<OsehContentTarget> => {
  const result = useWritableValueWithCallbacks<OsehContentTarget>(() => ({
    state: 'loading',
    error: null,
    webExport: null,
    presigned: null,
    jwt: null,
  }));

  useValuesWithCallbacksEffect(
    [refVWC, comparerVWC],
    useCallback(() => {
      if (window === undefined) {
        return undefined;
      }

      const refRaw = refVWC.get();
      const comparer = comparerVWC.get();

      if (refRaw === null || refRaw.uid === null || refRaw.jwt === null) {
        setVWC(
          result,
          {
            state: 'loading',
            error: null,
            webExport: null,
            presigned: null,
            jwt: null,
          },
          (a, b) => a.state === b.state
        );
        return undefined;
      }
      const ref = refRaw as MakePropsNotNull<typeof refRaw, 'uid' | 'jwt'>;

      let active = true;
      const cancelers = new Callbacks<undefined>();
      getTarget();
      return () => {
        active = false;
        cancelers.call(undefined);
      };

      async function getTargetInner(signal: AbortSignal | undefined) {
        const response = await fetchWebExport(ref.uid, ref.jwt, presign, comparer, signal);
        if (!active) {
          return;
        }
        setVWC(result, {
          state: 'loaded',
          error: null,
          webExport: response,
          presigned: presign,
          jwt: ref.jwt,
        });
      }

      async function getTarget() {
        if (!active) {
          return;
        }

        setVWC(
          result,
          {
            state: 'loading',
            error: null,
            webExport: null,
            presigned: null,
            jwt: null,
          },
          (a, b) => a.state === b.state
        );

        const controller = window.AbortController ? new AbortController() : undefined;
        const signal = controller?.signal;
        const doAbort = () => controller?.abort();
        cancelers.add(doAbort);

        try {
          await getTargetInner(signal);
        } catch (e) {
          if (!active) {
            return;
          }
          const err = isValidElement(e) ? e : await describeError(e);
          if (!active) {
            return;
          }
          setVWC(result, {
            state: 'failed',
            error: err,
            webExport: null,
            presigned: null,
            jwt: null,
          });
        } finally {
          cancelers.remove(doAbort);
        }
      }
    }, [refVWC, comparerVWC, presign, result])
  );

  return result;
};
