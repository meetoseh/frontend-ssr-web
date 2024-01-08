import { ReactElement } from 'react';
import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { OsehTranscript } from './OsehTranscript';
import { OsehTranscriptRef } from './OsehTranscriptRef';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { describeError } from '../components/ErrorBlock';
import { HTTP_API_URL } from '../ApiConstants';

export type OsehTranscriptResult =
  | {
      /**
       * Discriminator key; for error, something went wrong loading the
       * transcript
       */
      type: 'error';
      /**
       * An element describing what went wrong
       */
      error: ReactElement;
    }
  | {
      /**
       * Discriminator key; for loading, the transcript is still loading
       * or the transcript ref is null
       */
      type: 'loading';
    }
  | {
      /**
       * Discriminator key; for success, the transcript is loaded
       */
      type: 'success';
      /**
       * The underlying transcript
       */
      transcript: OsehTranscript;
    };

/**
 * Fetches the transcript associated with the given ref
 *
 * @param ref The reference to the transcript which should be fetched
 * @returns A value with callbacks which will be updated as the transcript
 *  loads
 */
export const useOsehTranscriptValueWithCallbacks = (
  ref: VariableStrategyProps<OsehTranscriptRef | null>
): ValueWithCallbacks<OsehTranscriptResult> => {
  const result = useWritableValueWithCallbacks<OsehTranscriptResult>(() => ({ type: 'loading' }));
  const refVWC = useVariableStrategyPropsAsValueWithCallbacks(ref);

  useValueWithCallbacksEffect(refVWC, (rawRef) => {
    setVWC(result, { type: 'loading' }, (a, b) => a.type === b.type);
    if (rawRef === null || window === undefined) {
      return;
    }
    const ref = rawRef;

    let running = true;
    const abortController: AbortController | null = window?.AbortController
      ? new AbortController()
      : null;
    fetchTranscript();
    return () => {
      running = false;
      abortController?.abort();
    };

    async function fetchTranscriptInner() {
      const response = await fetch(`${HTTP_API_URL}/api/1/transcripts/${ref.uid}`, {
        method: 'GET',
        headers: {
          Authorization: `bearer ${ref.jwt}`,
        },
      });

      if (!running) {
        return;
      }

      if (!response.ok) {
        throw response;
      }

      const rawTranscript: {
        uid: string;
        phrases: {
          starts_at: number;
          ends_at: number;
          phrase: string;
        }[];
      } = await response.json();

      if (!running) {
        return;
      }

      const transcript: OsehTranscript = {
        uid: rawTranscript.uid,
        phrases: rawTranscript.phrases.map((phrase) => ({
          startsAt: phrase.starts_at,
          endsAt: phrase.ends_at,
          phrase: phrase.phrase,
        })),
      };
      setVWC(
        result,
        { type: 'success', transcript },
        (a, b) =>
          a.type === 'success' &&
          b.type === 'success' &&
          a.transcript.uid === b.transcript.uid &&
          a.transcript.phrases.length === b.transcript.phrases.length &&
          a.transcript.phrases.every((phrase, index) => {
            const otherPhrase = b.transcript.phrases[index];
            return (
              phrase.startsAt === otherPhrase.startsAt &&
              phrase.endsAt === otherPhrase.endsAt &&
              phrase.phrase === otherPhrase.phrase
            );
          })
      );
    }

    async function fetchTranscript() {
      try {
        await fetchTranscriptInner();
      } catch (e) {
        const err = await describeError(e);
        if (!running) {
          return;
        }
        setVWC(result, { type: 'error', error: err }, () => false);
      }
    }
  });

  return result;
};
