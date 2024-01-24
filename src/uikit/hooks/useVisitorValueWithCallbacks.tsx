import { ReactElement, useCallback, useContext, useEffect, useRef } from 'react';
import { apiFetch } from '../ApiConstants';
import { LoginContext } from '../contexts/LoginContext';
import { Callbacks, ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useValuesWithCallbacksEffect } from './useValuesWithCallbacksEffect';

/**
 * The user associated with a visitor
 */
export type AssociatedUser = {
  /**
   * The sub of the user
   */
  sub: string;

  /**
   * The time we last made the association
   */
  time: number;
};

/**
 * The stored information about a devices visitor
 */
export type StoredVisitor = {
  /**
   * The uid of the visitor
   */
  uid: string;

  /**
   * The last user we told the backend to associate with this visitor,
   * or null if the user was logged out last session.
   */
  user: AssociatedUser | null;
};

export type UTM = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

/**
 * Fetches the UTM parameters from the current url, if there
 * are any.
 */
export const getUTMFromURL = (): UTM | null => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source');
  if (source === null) {
    return null;
  }

  return {
    source,
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
  };
};

type VisitorLoading = { loading: true };
type VisitorLoaded = { loading: false; uid: string | null; setVisitor: (uid: string) => void };

export type Visitor = VisitorLoading | VisitorLoaded;

/**
 * Loads the visitor from local storage, if it exists.
 * @returns The visitor, or null if it does not exist.
 */
export const loadVisitorFromStore = (): StoredVisitor | null => {
  const storedVisitorRaw = localStorage.getItem('visitor');
  return storedVisitorRaw === null ? null : (JSON.parse(storedVisitorRaw) as StoredVisitor);
};

/**
 * Writes the visitor to the store, unless it's null, in which removes
 * the visitor in the store.
 *
 * @param visitor The visitor to write to the store, or null to remove it.
 */
export const writeVisitorToStore = (visitor: StoredVisitor | null): void => {
  if (visitor === null) {
    localStorage.removeItem('visitor');
    return;
  }

  localStorage.setItem('visitor', JSON.stringify(visitor));
};

/**
 * Manages creating a visitor via the backend and associating it to the
 * current user. Must be used within a login context, and is intended to
 * only be included once per page.
 *
 * @param impliedUTM undefined if the current page loads utm information from
 *   the url, null if the current page should never store utm information,
 *   and a specific utm if the current page should always be treated as having
 *   the given utm parameters regardless of the URL.
 */
export const useVisitorValueWithCallbacks = (
  impliedUTM: ValueWithCallbacks<UTM | null | undefined> | undefined
): ValueWithCallbacks<Visitor> => {
  const loginContextRaw = useContext(LoginContext);
  const result = useWritableValueWithCallbacks<Visitor>(() => ({ loading: true }));
  const handleUTMForVisitorUID = useRef<string | null>(null);

  const alwaysAvailableImpliedUTM = useWritableValueWithCallbacks<UTM | null | undefined>(
    () => impliedUTM?.get()
  );

  useEffect(() => {
    if (impliedUTM === undefined) {
      setVWC(alwaysAvailableImpliedUTM, undefined);
      return;
    }

    const vwc = impliedUTM;
    vwc.callbacks.add(onChange);
    onChange();
    return () => {
      vwc.callbacks.remove(onChange);
    };

    function onChange() {
      let current = vwc.get();
      if (current !== null && current !== undefined) {
        // guarding copy to ensure we can use a real equality fn
        current = { ...current };
      }

      setVWC(
        alwaysAvailableImpliedUTM,
        current,
        (a, b) =>
          a === b ||
          (a !== null &&
            a !== undefined &&
            b !== null &&
            b !== undefined &&
            a.source === b.source &&
            a.medium === b.medium &&
            a.campaign === b.campaign &&
            a.content === b.content &&
            a.term === b.term)
      );
    }
  }, [impliedUTM, alwaysAvailableImpliedUTM]);

  const setVisitor = useCallback(
    (uid: string): void => {
      setVWC(result, { loading: false, uid, setVisitor });
    },
    [result]
  );

  const updateVisitor = useCallback((): (() => void) => {
    const loginContextUnch = loginContextRaw.value.get();
    if (loginContextUnch.state === 'loading') {
      return () => {};
    }

    let active = true;
    const cancelers = new Callbacks<undefined>();
    handleVisitor();
    return () => {
      active = false;
      cancelers.call(undefined);
    };

    async function handleVisitorInner() {
      const storedVisitor = loadVisitorFromStore();

      const currentUserSub =
        loginContextUnch.state === 'logged-in' ? loginContextUnch.userAttributes.sub : null;
      const forcedUTM = alwaysAvailableImpliedUTM.get();
      const utm =
        handleUTMForVisitorUID.current === storedVisitor?.uid
          ? null
          : forcedUTM === undefined
            ? getUTMFromURL()
            : forcedUTM;

      const minTime = Date.now() - 1000 * 60 * 60 * 24;

      let newVisitor: StoredVisitor | null = null;

      if (storedVisitor === null && currentUserSub === null && utm === null) {
        const controller = window.AbortController !== undefined ? new AbortController() : null;
        const signal = controller?.signal;
        const doAbort = () => controller?.abort();
        cancelers.add(doAbort);
        const response = await apiFetch(
          '/api/1/visitors/?source=browser',
          { method: 'POST', signal },
          null
        );
        cancelers.remove(doAbort);
        if (!response.ok) {
          throw response;
        }

        const data = await response.json();
        newVisitor = { uid: data.uid, user: null };
      } else if (
        currentUserSub !== null &&
        utm === null &&
        (storedVisitor?.user?.sub !== currentUserSub || (storedVisitor?.user?.time ?? 0) < minTime)
      ) {
        const response = await apiFetch(
          '/api/1/visitors/users?source=browser',
          {
            method: 'POST',
            headers: storedVisitor === null ? {} : { Visitor: storedVisitor.uid },
          },
          loginContextUnch.state === 'logged-in' ? loginContextUnch : null
        );
        if (!response.ok) {
          throw response;
        }

        const data = await response.json();
        newVisitor = { uid: data.uid, user: { sub: currentUserSub, time: Date.now() } };
      } else if (utm !== null) {
        const response = await apiFetch(
          '/api/1/visitors/utms?source=browser',
          {
            method: 'POST',
            headers: Object.assign(
              (storedVisitor === null ? {} : { Visitor: storedVisitor.uid }) as {
                [key: string]: string;
              },
              {
                'Content-Type': 'application/json; charset=utf-8',
              } as { [key: string]: string }
            ),
            body: JSON.stringify({
              utm_source: utm.source,
              utm_medium: utm.medium,
              utm_campaign: utm.campaign,
              utm_content: utm.content,
              utm_term: utm.term,
            }),
          },
          loginContextUnch.state === 'logged-in' ? loginContextUnch : null
        );
        if (!response.ok) {
          throw response;
        }

        const data = await response.json();
        newVisitor = {
          uid: data.uid,
          user: currentUserSub === null ? null : { sub: currentUserSub, time: Date.now() },
        };
        handleUTMForVisitorUID.current = newVisitor.uid;
      }

      if (newVisitor !== null) {
        writeVisitorToStore(newVisitor);
        setVWC(result, { loading: false, uid: newVisitor.uid, setVisitor });
      } else if (storedVisitor !== null) {
        setVWC(result, { loading: false, uid: storedVisitor.uid, setVisitor });
      }
    }

    async function handleVisitor() {
      if (!active) {
        return;
      }

      try {
        await handleVisitorInner();
      } catch (e) {
        if (active) {
          setVWC(result, { loading: false, uid: null, setVisitor });
        }
      }
    }
  }, [loginContextRaw, result, setVisitor, alwaysAvailableImpliedUTM]);

  useValuesWithCallbacksEffect([loginContextRaw.value, alwaysAvailableImpliedUTM], updateVisitor);

  return result;
};

/**
 * A empty fragment which, as a side effect, calls useVisitor.
 *
 * @param impliedUTM undefined if the current page loads utm information from
 *   the url, null if the current page should never store utm information,
 *   and a specific utm if the current page should always be treated as having
 *   the given utm parameters regardless of the URL.
 */
export const VisitorHandler = (
  impliedUTM: ValueWithCallbacks<UTM | null | undefined> | undefined
): ReactElement => {
  useVisitorValueWithCallbacks(impliedUTM);
  return <></>;
};
