import { ReactElement, useCallback, useContext, useEffect, useMemo } from 'react';
import { apiFetch } from '../ApiConstants';
import { LoginContext, LoginContextValueLoggedIn } from '../contexts/LoginContext';
import {
  ValueWithCallbacks,
  createWritableValueWithCallbacks,
  useWritableValueWithCallbacks,
} from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useValueWithCallbacksEffect } from './useValueWithCallbacksEffect';
import { VISITOR_SOURCE } from '../lib/visitorSource';
import { useMappedValueWithCallbacks } from './useMappedValueWithCallbacks';

/**
 * The user associated with a visitor
 */
export type AssociatedUser = {
  /**
   * The sub of the user
   */
  sub: string;

  /**
   * The time we last made the association, in local clock ms since epoch
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

const areUtmsEqual = (a: UTM | null, b: UTM | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }

  return (
    a.source === b.source &&
    a.medium === b.medium &&
    a.campaign === b.campaign &&
    a.content === b.content &&
    a.term === b.term
  );
};

/**
 * Fetches the UTM parameters from the current url, if there
 * are any.
 */
export const getUTMFromURL = (): UTM | null => {
  if (window === undefined) {
    return null;
  }

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
type VisitorLoaded = {
  loading: false;
  uid: string | null;
};

export type VisitorValue = VisitorLoading | VisitorLoaded;
export type Visitor = {
  value: ValueWithCallbacks<VisitorValue>;
  setVisitor: (uid: string) => void;
};

/**
 * Loads the visitor from local storage, if it exists.
 * @returns The visitor, or null if it does not exist.
 */
export const loadVisitorFromStore = (): StoredVisitor | null | Promise<StoredVisitor | null> => {
  const storedVisitorRaw = localStorage.getItem('visitor');
  return storedVisitorRaw === null ? null : (JSON.parse(storedVisitorRaw) as StoredVisitor);
};

/**
 * Writes the visitor to the store, unless it's null, in which removes
 * the visitor in the store.
 *
 * @param visitor The visitor to write to the store, or null to remove it.
 */
export const writeVisitorToStore = async (visitor: StoredVisitor | null): Promise<void> => {
  if (visitor === null) {
    localStorage.removeItem('visitor');
    return;
  }

  localStorage.setItem('visitor', JSON.stringify(visitor));
};

// we define an async finite state machine to handle loading the visitor while seamlessly
// managing interruptions

/** We are fetching the data from our store */
type VisitorAFSMNotStarted = {
  type: 'loadingFromStore';
  user: LoginContextValueLoggedIn | null;
  utm: UTM | null;
};
/** We have are making the appropriate network request */
type VisitorAFSMRequesting = {
  type: 'requesting';
  uid: string | null;
  user: LoginContextValueLoggedIn | null;
  utm: UTM | null;
};
/** We have a visitor with potentially an attached user and utm and are finishing up by persisting to storage */
type VisitorAFSMStoring = {
  type: 'storing';
  uid: string;
  user: {
    storing: AssociatedUser | null;
    current: LoginContextValueLoggedIn | null;
  };
  utm: UTM | null;
};
/** We have a visitor with potentially an attached user and utm and aren't doing anything */
type VisitorAFSMReady = {
  type: 'ready';
  uid: string;
  user: {
    stored: AssociatedUser | null;
    current: LoginContextValueLoggedIn | null;
  };
  utm: UTM | null;
};
/** We encountered an error initializing and aren't currently doing anything */
type VisitorAFSMError = { type: 'error'; user: LoginContextValueLoggedIn | null; utm: UTM | null };

type VisitorAFSMState =
  | VisitorAFSMNotStarted
  | VisitorAFSMRequesting
  | VisitorAFSMStoring
  | VisitorAFSMReady
  | VisitorAFSMError;

type VisitorAFSMType = VisitorAFSMState['type'];

type VisitorAFSMEventUserChanged = { type: 'userChanged'; user: LoginContextValueLoggedIn | null };
type VisitorAFSMEventUtmChanged = { type: 'utmChanged'; utm: UTM | null };
type VisitorAFSMEventUnmounted = { type: 'unmounted' };
type VisitorAFSMVisitorForced = { type: 'visitorForced'; uid: string | null };

type VisitorAFSMEvent =
  | VisitorAFSMEventUserChanged
  | VisitorAFSMEventUtmChanged
  | VisitorAFSMEventUnmounted
  | VisitorAFSMVisitorForced;
type VisitorAFSMEventType = VisitorAFSMEvent['type'];

type VisitorAFSMHandlerResult = {
  /**
   * MUST start out null. Must transition to undefined (if unmounted), or a new state to allow the
   * state machine to start up a new handler
   */
  newState: ValueWithCallbacks<VisitorAFSMState | null | undefined>;
  onEvent: {
    [K in VisitorAFSMEventType]: (event: VisitorAFSMEvent & { type: K }) => void;
  };
};

type VisitorAFSMHandler<T extends VisitorAFSMType> = (
  state: VisitorAFSMState & { type: T }
) => VisitorAFSMHandlerResult;

type VisitorAFSMHandlers = {
  [K in VisitorAFSMType]: VisitorAFSMHandler<K>;
};

// we are careful to guard the writes to storage; we will not assume its
// safe to run concurrent queries/writes to the same key

const handlers: VisitorAFSMHandlers = {
  loadingFromStore: (state) => {
    const newState = createWritableValueWithCallbacks<VisitorAFSMState | null | undefined>(null);
    let active = true;
    let queuedState: VisitorAFSMState | undefined = undefined;
    fetchFromStore().finally(() => {
      setVWC(newState, queuedState);
    });
    return {
      newState,
      onEvent: {
        userChanged: (event) => {
          if (!active) {
            return;
          }

          queuedState = { type: 'loadingFromStore', user: event.user, utm: state.utm };
          active = false;
        },
        utmChanged: (event) => {
          if (!active) {
            return;
          }

          if (areUtmsEqual(event.utm, state.utm)) {
            return;
          }

          queuedState = { type: 'loadingFromStore', user: state.user, utm: event.utm };
          active = false;
        },
        visitorForced: (event) => {
          if (!active) {
            return;
          }

          if (event.uid === null) {
            return;
          } else if (state.user !== null || state.utm !== null) {
            queuedState = { type: 'requesting', user: state.user, utm: state.utm, uid: event.uid };
            active = false;
          } else {
            queuedState = {
              type: 'storing',
              uid: event.uid,
              user: { storing: null, current: null },
              utm: null,
            };
            active = false;
          }
        },
        unmounted: () => {
          active = false;
        },
      },
    };

    async function fetchFromStore() {
      if (!active) {
        return;
      }
      const stored = await loadVisitorFromStore();
      if (!active) {
        return;
      }

      active = false;
      if (
        stored === null ||
        state.utm !== null ||
        (state.user !== null &&
          (stored.user === null ||
            stored.user.sub !== state.user.userAttributes.sub ||
            stored.user.time < Date.now() - 1000 * 60 * 60 * 24))
      ) {
        queuedState = {
          type: 'requesting',
          user: state.user,
          utm: state.utm,
          uid: stored === null ? null : stored.uid,
        };
      } else {
        queuedState = {
          type: 'ready',
          uid: stored.uid,
          user: { stored: stored.user, current: state.user },
          utm: null,
        };
      }
    }
  },
  requesting: (state) => {
    const newState = createWritableValueWithCallbacks<VisitorAFSMState | null | undefined>(null);
    const controller = new AbortController();
    fetchFromNetwork();
    return {
      newState,
      onEvent: {
        userChanged: (event) => {
          if (controller.signal.aborted) {
            return;
          }

          if (event.user === null && state.user === null) {
            return;
          }

          if (
            event.user !== null &&
            state.user !== null &&
            event.user.authTokens.idToken === state.user.authTokens.idToken
          ) {
            // irrelevant change
            return;
          }

          controller.abort();
          setVWC(newState, {
            type: 'requesting',
            user: event.user,
            utm: state.utm,
            uid: state.uid,
          });
        },
        utmChanged: (event) => {
          if (controller.signal.aborted) {
            return;
          }

          if (areUtmsEqual(event.utm, state.utm)) {
            return;
          }

          controller.abort();
          setVWC(newState, {
            type: 'requesting',
            user: state.user,
            utm: event.utm,
            uid: state.uid,
          });
        },
        visitorForced: (event) => {
          if (controller.signal.aborted) {
            return;
          }

          if (event.uid === state.uid) {
            return;
          }

          if (
            event.uid !== null &&
            state.uid === null &&
            state.user === null &&
            state.utm === null
          ) {
            controller.abort();
            setVWC(newState, {
              type: 'storing',
              uid: event.uid,
              user: { storing: null, current: null },
              utm: null,
            });
            return;
          }

          controller.abort();
          setVWC(newState, {
            type: 'requesting',
            user: state.user,
            utm: state.utm,
            uid: event.uid,
          });
        },
        unmounted: () => {
          if (controller.signal.aborted) {
            return;
          }

          controller.abort();
          setVWC(newState, undefined);
        },
      },
    };

    async function fetchFromNetwork() {
      if (controller.signal.aborted) {
        return;
      }

      try {
        const startedAtLocalMS = Date.now();
        const response = await (() => {
          const headers = new Headers();
          if (state.uid !== null) {
            headers.set('visitor', state.uid);
          }

          if (state.utm === null) {
            return apiFetch(
              '/api/1/visitors/?source=' + encodeURIComponent(VISITOR_SOURCE),
              {
                method: 'POST',
                headers,
                signal: controller.signal,
              },
              state.user
            );
          } else {
            headers.set('content-type', 'application/json; charset=utf-8');
            return apiFetch(
              '/api/1/visitors/utms?source=' + encodeURIComponent(VISITOR_SOURCE),
              {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                  utm_source: state.utm.source,
                  utm_medium: state.utm.medium,
                  utm_campaign: state.utm.campaign,
                  utm_term: state.utm.term,
                  utm_content: state.utm.content,
                }),
              },
              state.user
            );
          }
        })();
        if (controller.signal.aborted) {
          return;
        }
        if (!response.ok) {
          throw response;
        }
        const result: { uid: string } = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        const associatedUser =
          state.user === null
            ? null
            : {
                sub: state.user.userAttributes.sub,
                time: startedAtLocalMS,
              };

        const visitorUid = result.uid;
        if (typeof visitorUid !== 'string') {
          throw new Error(`invalid result: ${JSON.stringify(result)}`);
        }

        controller.abort();
        setVWC(newState, {
          type: 'storing',
          uid: visitorUid,
          user: {
            storing: associatedUser,
            current: state.user,
          },
          utm: state.utm,
        });
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }

        controller.abort();
        setVWC(newState, { type: 'error', user: state.user, utm: state.utm });
      }
    }
  },
  storing: (state) => {
    const newState = createWritableValueWithCallbacks<VisitorAFSMState | null | undefined>(null);
    let active = true;
    let queuedState: VisitorAFSMState | undefined = undefined;
    doStore().finally(() => {
      setVWC(newState, queuedState);
    });
    return {
      newState,
      onEvent: {
        userChanged: (event) => {
          if (!active) {
            return;
          }

          if (event.user === null) {
            // this won't need to trigger a request, but we do want to avoid keeping local
            // references to old users in case this is a shared computer
            queuedState = {
              type: 'storing',
              user: { storing: null, current: null },
              uid: state.uid,
              utm: state.utm,
            };
            active = false;
            return;
          }

          if (
            state.user.storing !== null &&
            state.user.storing.sub === event.user.userAttributes.sub
          ) {
            // we need to avoid losing the ref, but otherwise this is a no-op
            queuedState = {
              type: 'storing',
              user: { storing: state.user.storing, current: event.user },
              uid: state.uid,
              utm: state.utm,
            };
            active = false;
            return;
          }

          queuedState = { type: 'requesting', user: event.user, utm: state.utm, uid: state.uid };
          active = false;
        },
        utmChanged: (event) => {
          if (!active) {
            return;
          }

          if (areUtmsEqual(event.utm, state.utm)) {
            return;
          }

          if (event.utm === null) {
            queuedState = {
              type: 'storing',
              user: state.user,
              uid: state.uid,
              utm: null,
            };
            active = false;
            return;
          }

          queuedState = {
            type: 'requesting',
            user: state.user.current,
            utm: event.utm,
            uid: state.uid,
          };
          active = false;
        },
        visitorForced: (event) => {
          if (!active) {
            return;
          }

          if (event.uid === state.uid) {
            return;
          }

          if (event.uid !== null && state.user.current === null && state.utm === null) {
            queuedState = {
              type: 'storing',
              uid: event.uid,
              user: { storing: null, current: null },
              utm: null,
            };
            active = false;
            return;
          }

          queuedState = {
            type: 'requesting',
            user: state.user.current,
            utm: state.utm,
            uid: event.uid,
          };
          active = false;
        },
        unmounted: () => {
          active = false;
        },
      },
    };

    async function doStore() {
      if (!active) {
        return;
      }

      await writeVisitorToStore({
        uid: state.uid,
        user: state.user.storing,
      });
      if (!active) {
        return;
      }

      active = false;
      queuedState = {
        type: 'ready',
        uid: state.uid,
        user: { stored: state.user.storing, current: state.user.current },
        utm: state.utm,
      };
    }
  },
  ready: (state) => {
    const newState = createWritableValueWithCallbacks<VisitorAFSMState | null | undefined>(null);
    let active = true;
    return {
      newState,
      onEvent: {
        userChanged: (event) => {
          if (!active) {
            return;
          }

          if (event.user === null && state.user.current === null) {
            return;
          }

          if (
            event.user !== null &&
            state.user.stored !== null &&
            event.user.userAttributes.sub === state.user.stored.sub
          ) {
            if (state.user.stored.time < Date.now() - 1000 * 60 * 60 * 24) {
              active = false;
              setVWC(newState, {
                type: 'requesting',
                user: event.user,
                utm: state.utm,
                uid: state.uid,
              });
            } else {
              active = false;
              setVWC(newState, {
                type: 'ready',
                user: { stored: state.user.stored, current: event.user },
                uid: state.uid,
                utm: state.utm,
              });
            }
            return;
          }

          if (event.user === null && state.user.stored !== null) {
            // cleanup local references
            active = false;
            setVWC(newState, {
              type: 'storing',
              user: { storing: null, current: null },
              uid: state.uid,
              utm: state.utm,
            });
            return;
          }

          active = false;
          setVWC(newState, {
            type: 'requesting',
            user: event.user,
            utm: state.utm,
            uid: state.uid,
          });
        },
        utmChanged: (event) => {
          if (!active) {
            return;
          }

          if (areUtmsEqual(event.utm, state.utm)) {
            return;
          }

          active = false;
          setVWC(newState, {
            type: 'requesting',
            user: state.user.current,
            utm: event.utm,
            uid: state.uid,
          });
        },
        visitorForced: (event) => {
          if (!active) {
            return;
          }

          if (event.uid === state.uid) {
            return;
          }

          if (event.uid === null || state.user.current !== null || state.utm !== null) {
            active = false;
            setVWC(newState, {
              type: 'requesting',
              user: state.user.current,
              utm: state.utm,
              uid: event.uid,
            });
            return;
          }

          active = false;
          setVWC(newState, {
            type: 'storing',
            uid: event.uid,
            user: { storing: null, current: null },
            utm: null,
          });
        },
        unmounted: () => {
          if (!active) {
            return;
          }

          active = false;
          setVWC(newState, undefined);
        },
      },
    };
  },
  error: (state) => {
    const newState = createWritableValueWithCallbacks<VisitorAFSMState | null | undefined>(null);
    let active = true;
    return {
      newState,
      onEvent: {
        userChanged: (event) => {
          if (!active) {
            return;
          }
          active = false;
          setVWC(newState, { type: 'loadingFromStore', user: event.user, utm: state.utm });
        },
        utmChanged: (event) => {
          if (!active) {
            return;
          }
          active = false;
          setVWC(newState, { type: 'loadingFromStore', user: state.user, utm: event.utm });
        },
        visitorForced: (event) => {
          if (!active) {
            return;
          }

          if (event.uid === null) {
            active = false;
            setVWC(newState, { type: 'loadingFromStore', user: state.user, utm: state.utm });
            return;
          }

          if (state.user !== null || state.utm !== null) {
            active = false;
            setVWC(newState, {
              type: 'requesting',
              user: state.user,
              utm: state.utm,
              uid: event.uid,
            });
            return;
          }

          active = false;
          setVWC(newState, {
            type: 'storing',
            uid: event.uid,
            user: { storing: null, current: null },
            utm: null,
          });
          return;
        },
        unmounted: () => {
          if (!active) {
            return;
          }
          active = false;
          setVWC(newState, undefined);
        },
      },
    };
  },
};

/**
 * Manages creating a visitor via the backend and associating it to the
 * current user. Must be used within a login context, and is intended to
 * only be included once per page.
 */
export const useVisitorValueWithCallbacks = (
  forcedUtm?: ValueWithCallbacks<UTM | null>
): Visitor => {
  const loginContextRaw = useContext(LoginContext);
  const utmFromUrl = useMemo(() => getUTMFromURL(), []);
  const stateMachine = useWritableValueWithCallbacks<{
    state: VisitorAFSMState;
    result: VisitorAFSMHandlerResult;
  }>(() => {
    const loginContextUnch = loginContextRaw.value.get();

    const state: VisitorAFSMState =
      window === undefined
        ? {
            type: 'error',
            user: null,
            utm: null,
          }
        : {
            type: 'loadingFromStore',
            user: loginContextUnch.state === 'logged-in' ? loginContextUnch : null,
            utm: forcedUtm?.get?.() ?? utmFromUrl,
          };
    return { state, result: handlers[state.type](state as any) };
  });

  useValueWithCallbacksEffect(loginContextRaw.value, (loginContextUnch) => {
    if (window === undefined) {
      return;
    }
    const loginContext = loginContextUnch.state === 'logged-in' ? loginContextUnch : null;
    stateMachine.get().result.onEvent.userChanged({ type: 'userChanged', user: loginContext });
    return undefined;
  });

  useEffect(() => {
    if (window === undefined) {
      return;
    }

    if (forcedUtm === undefined) {
      return;
    }

    const vwc = forcedUtm;
    vwc.callbacks.add(onChanged);
    onChanged();
    return () => {
      vwc.callbacks.remove(onChanged);
    };

    function onChanged() {
      stateMachine
        .get()
        .result.onEvent.utmChanged({ type: 'utmChanged', utm: vwc.get() ?? utmFromUrl });
    }
  }, [stateMachine, forcedUtm]);

  const setVisitor = useCallback(
    (uid: string) => {
      stateMachine.get().result.onEvent.visitorForced({ type: 'visitorForced', uid });
    },
    [stateMachine]
  );

  useEffect(() => {
    if (window === undefined) {
      return;
    }

    const active = createWritableValueWithCallbacks(true);
    progress();
    return () => {
      if (!active.get()) {
        return;
      }

      setVWC(active, false);
      stateMachine.get().result.onEvent.unmounted({ type: 'unmounted' });
    };

    function progress() {
      if (!active) {
        return;
      }

      while (true) {
        const originalVal = stateMachine.get();
        let state = originalVal.state;

        const newState = originalVal.result.newState;
        const removeHandlers = () => {
          newState.callbacks.remove(removeHandlersAndProgress);
          active.callbacks.remove(removeHandlers);
        };
        const removeHandlersAndProgress = () => {
          removeHandlers();
          progress();
        };
        newState.callbacks.add(removeHandlersAndProgress);
        active.callbacks.add(removeHandlers);
        const nextState = newState.get();
        if (nextState === null) {
          return;
        }
        removeHandlers();
        if (nextState !== undefined) {
          state = nextState;
        }

        const newVal = { state, result: handlers[state.type](state as any) };
        setVWC(stateMachine, newVal);
      }
    }
  }, [stateMachine]);

  const mappedStateMachineVWC = useMappedValueWithCallbacks(stateMachine, (v): VisitorValue => {
    if (v.state.type === 'error') {
      return { loading: false, uid: null };
    }

    if (v.state.type === 'ready') {
      return { loading: false, uid: v.state.uid };
    }

    return { loading: true };
  });

  return useMemo(
    () => ({
      value: mappedStateMachineVWC,
      setVisitor,
    }),
    [mappedStateMachineVWC, setVisitor]
  );
};

/**
 * A empty fragment which, as a side effect, calls useVisitor.
 */
export const VisitorHandler = (): ReactElement => {
  useVisitorValueWithCallbacks();
  return <></>;
};
