import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useRef } from 'react';
import { Buffer } from 'buffer';
import { apiFetch } from '../ApiConstants';
import { getCurrentServerTimeMS } from '../lib/getCurrentServerTimeMS';
import { Callbacks, useWritableValueWithCallbacks, ValueWithCallbacks } from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { getJwtExpiration } from '../lib/getJwtExpiration';

/**
 * The user attributes that are available when a user is logged in. When
 * changing user attributes via the backend we may not necessarily regenerate
 * the jwt, hence the jwts values may be stale.
 */
export type UserAttributes = {
  /**
   * The users unique identifier
   */
  sub: string;

  /**
   * The user's email address, if available
   */
  email: string | null;

  /**
   * The users phone number, if available. Most users will not have a phone
   * number available directly from single sign on.
   */
  phoneNumber: string | null;

  /**
   * The users name as they specified it. This is sometimes broken down into
   * givenName and familyName - if we have those we merge them to get name,
   * and if we only have the name we split it so that the first word is the
   * given name. Where we only have name and it's 1 word, the familyName is
   * a blank string.
   *
   * Not always available - in particular, when using Sign in with Apple we
   * will not initially have their name.
   */
  name: string | null;

  /**
   * The users given name, if available. See name for more details.
   */
  givenName: string | null;

  /**
   * The users family name, if available. See name for more details.
   */
  familyName: string | null;
};

/**
 * The tokens after logging in.
 */
export type TokenResponseConfig = {
  /**
   * The id token - this is the primary bearer token for interacting with the
   * backend.
   */
  idToken: string;

  /**
   * The refresh token, if available. This can be used to get a new id token
   * for up to 30 days after it was first issued and up to 90 days after the
   * user logged in.
   */
  refreshToken: string | null;
};

/**
 * The login context's provided value when logged in.
 */
export type LoginContextValueLoggedIn = {
  /**
   * The disjoint union tag for the state.
   */
  state: 'logged-in';
  /**
   * The auth tokens that can be used in requests
   */
  authTokens: TokenResponseConfig;
  /**
   * The user attributes for the logged in user, which are based on the
   * claims in the id token, but can be updated independently.
   */
  userAttributes: UserAttributes;
};

/**
 * The login context's provided value when we are in the process of
 * loading from stores.
 */
export type LoginContextValueLoading = {
  state: 'loading';
};

/**
 * The login context's provided value when logged out
 */
export type LoginContextValueLoggedOut = {
  state: 'logged-out';
};

export type LoginContextValueUnion =
  | LoginContextValueLoggedIn
  | LoginContextValueLoading
  | LoginContextValueLoggedOut;

/**
 * The value provided by the login context.
 */
export type LoginContextValue = {
  value: ValueWithCallbacks<LoginContextValueUnion>;

  /**
   * The function to call to set the authtokens to a new value. This will
   * update the state to logged-in if the new value is not null, and
   * logged-out otherwise. This will store the new value in the secure store.
   *
   * If authTokens is null, this will clear userAttributes. Otherwise, this
   * will reset userAttributes to match the claims in the new idToken.
   *
   * This cannot be called during the 'loading' state.
   */
  setAuthTokens: (authTokens: TokenResponseConfig | null) => Promise<void>;

  /**
   * The function to call to set the user attributes to a new value.
   * Raises an error if not logged in.
   */
  setUserAttributes: (userAttributes: UserAttributes) => Promise<void>;
};

const defaultProps: LoginContextValue = {
  value: {
    get() {
      throw new Error('attempt to access LoginContextValue defaultProps value.get');
    },
    get callbacks(): Callbacks<undefined> {
      throw new Error('attempt to access LoginContextValue defaultProps value.callbacks');
    },
  },
  setAuthTokens: async () => {
    throw new Error('attempt to setAuthTokens on LoginContextValue defaultProps');
  },
  setUserAttributes: async () => {
    throw new Error('attempt to setUserAttributes on LoginContextValue defaultProps');
  },
};

/**
 * A React Context which provides the authTokens required for communicating
 * with the backend.
 *
 * In particular, whenever the backend calls for an "id token", it is referring
 * to the authTokens.idToken.
 *
 * Do NOT use the LoginContext.Provider directly. Instead use the exported
 * LoginProvider.
 */
export const LoginContext: React.Context<LoginContextValue> = createContext(defaultProps);

/**
 * The expected props to the LoginProvider
 */
type LoginProviderProps = object;

/**
 * Extracts the user attributes from the given token response by inspecting
 * the claims for the idToken.
 *
 * @param tokenConfig The token config to use to get the user attributes
 */
export const extractUserAttributes = (tokenConfig: TokenResponseConfig): UserAttributes => {
  // we don't need to verify the idToken since this only effects the client,
  // and they can lie to themselves if they want
  const idToken = tokenConfig.idToken;
  const claimsBase64 = idToken.split('.')[1];
  const claimsJson = Buffer.from(claimsBase64, 'base64').toString('utf8');
  const claims = JSON.parse(claimsJson);

  const nameClaims: { name: string | null; given_name: string | null; family_name: string | null } =
    Object.assign({ name: null, given_name: null, family_name: null }, claims);

  if (
    nameClaims.name === null &&
    (nameClaims.given_name !== null || nameClaims.family_name !== null)
  ) {
    nameClaims.name = (
      (nameClaims.given_name || '') +
      ' ' +
      (nameClaims.family_name || '')
    ).trimEnd();
  }

  if (
    nameClaims.name !== null &&
    (nameClaims.given_name === null || nameClaims.family_name === null)
  ) {
    const spaceIndex = nameClaims.name.indexOf(' ');
    if (spaceIndex !== -1) {
      nameClaims.given_name = nameClaims.name.substring(0, spaceIndex);
      nameClaims.family_name = nameClaims.name.substring(spaceIndex + 1);
    } else {
      nameClaims.given_name = nameClaims.name;
      nameClaims.family_name = '';
    }
  }

  return {
    sub: claims.sub,
    email: claims.email,
    phoneNumber: claims.phone_number || null,
    name: nameClaims.name,
    givenName: nameClaims.given_name,
    familyName: nameClaims.family_name,
  };
};

/**
 * Stores the given auth tokens in the appropriate store.
 *
 * @param authTokens The auth tokens to store
 */
export const storeAuthTokens = async (authTokens: TokenResponseConfig | null) => {
  // We're async for consistency with the react-native app, but there is no async
  // storage interface available
  if (authTokens === null) {
    console.trace('clearing auth tokens');
    localStorage.removeItem('authTokens');
  } else {
    localStorage.setItem('authTokens', JSON.stringify(authTokens));
  }
};

/**
 * Retrieves the auth tokens from the appropriate store, stored via storeAuthTokens
 *
 * @returns The auth tokens from the appropriate store
 */
const retrieveAuthTokens = async (): Promise<TokenResponseConfig | null> => {
  // We're async for consistency with the react-native app, but there is no async
  // storage interface available
  const authTokensJson = localStorage.getItem('authTokens');
  if (authTokensJson === null) {
    return null;
  }
  return JSON.parse(authTokensJson);
};

/**
 * Stores the given user attributes in the appropriate store.
 *
 * @param userAttributes The user attributes to store
 */
export const storeUserAttributes = async (userAttributes: UserAttributes | null) => {
  // We're async for consistency with the react-native app, but there is no async
  // storage interface available
  if (userAttributes === null) {
    localStorage.removeItem('userAttributes');
  } else {
    localStorage.setItem('userAttributes', JSON.stringify(userAttributes));
  }
};

/**
 * Retrieves the user attributes from the appropriate store, stored via storeUserAttributes
 *
 * @returns The user attributes from the appropriate store
 */
const retrieveUserAttributes = async (): Promise<UserAttributes | null> => {
  // We're async for consistency with the react-native app, but there is no async
  // storage interface available
  const userAttributesJson = localStorage.getItem('userAttributes');
  if (userAttributesJson === null) {
    return null;
  }

  return JSON.parse(userAttributesJson);
};

/**
 * Returns true if the given token is fresh, false if it is expired or about to
 * expire.
 *
 * @param token The token to check
 * @param nowMs The current server time in milliseconds since the unix epoch
 */
const isTokenFresh = (token: TokenResponseConfig, nowMs: number): boolean => {
  const minExpTime = nowMs + 1000 * 60 * 5;

  const claimsBase64 = token.idToken.split('.')[1];
  const claimsJson = Buffer.from(claimsBase64, 'base64').toString('utf8');
  const claims = JSON.parse(claimsJson);
  return claims.exp * 1000 > minExpTime;
};

/**
 * Determines if it's possible to refresh the id token in the given response
 *
 * @param token The token to check
 * @param nowMs The current server time in milliseconds since the unix epoch
 * @returns True if the token is refreshable, false otherwise
 */
const isRefreshable = (token: TokenResponseConfig, nowMs: number): boolean => {
  if (token.refreshToken === null) {
    return false;
  }

  const maxIat = nowMs - 1000 * 60 * 10;
  const minExpTime = nowMs + 1000 * 60 * 5;
  const minOgExpTime = nowMs - 1000 * 60 * 60 * 24 * 60 + 1000 * 60 * 5;

  const refreshClaimsBase64 = token.refreshToken.split('.')[1];
  const refreshClaimsJson = Buffer.from(refreshClaimsBase64, 'base64').toString('utf8');
  const refreshClaims = JSON.parse(refreshClaimsJson);

  if (refreshClaims.iat <= 1679589900) {
    // tokens with an iat at or below this time were revoked
    return false;
  }

  const refreshable =
    refreshClaims.exp * 1000 > minExpTime &&
    refreshClaims['oseh:og_exp'] * 1000 > minOgExpTime &&
    refreshClaims.iat * 1000 < maxIat;

  return refreshable;
};

/**
 * Attempts to refresh the given tokens, returning the new tokens on success
 * and rejecting the promise on failure.
 *
 * @param oldTokens The tokens to refresh
 * @returns The new tokens
 */
const refreshTokens = async (oldTokens: TokenResponseConfig): Promise<TokenResponseConfig> => {
  const response = await apiFetch(
    '/api/1/oauth/refresh',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        refresh_token: oldTokens.refreshToken,
      }),
    },
    null
  );

  if (!response.ok) {
    throw response;
  }

  const data: { id_token: string; refresh_token: string } = await response.json();
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  };
};

/**
 * web-only; determines the appropriate event and state key to use for
 * checking visibility, if one exists
 */
const getVisibilityKeys = (): {
  visibilityChange: string;
  hidden: string & keyof Document;
} | null => {
  let visibilityEventKey: string | null = null;
  let visibilityStateKey: keyof Document | null = null;
  for (let [stateKey, eventKey] of [
    ['hidden', 'visibilitychange'],
    ['webkitHidden', 'webkitvisibilitychange'],
    ['mozHidden', 'mozvisibilitychange'],
    ['msHidden', 'msvisibilitychange'],
  ]) {
    if (stateKey in document) {
      visibilityEventKey = eventKey;
      visibilityStateKey = stateKey as keyof Document;
      return {
        visibilityChange: visibilityEventKey,
        hidden: visibilityStateKey,
      };
    }
  }
  return null;
};

/**
 * Determines if it's possible to check if the tab is active / we're in the
 * foreground, or some good enough proxy.
 *
 * @returns True if we can check if we're in the foreground, false otherwise
 */
const canCheckForegrounded = async () => {
  return getVisibilityKeys() !== null;
};

/**
 * Checks if we're currently foregrounded. The behavior of this function
 * if canCheckForegrounded returns false is undefined.
 *
 * @returns True if we're foregrounded, false otherwise
 */
const isForegrounded = async () => {
  const keys = getVisibilityKeys();
  if (keys === null) {
    throw new Error('Cannot check foregrounded state');
  }

  return !document[keys.hidden];
};

type ForegroundChangedIdentifier = () => void;

/**
 * Adds the given listener to be called when the foregrounded state changes.
 * The behavior of this function if canCheckForegrounded returns false is
 * undefined.
 *
 * @param listener The listener to add
 * @returns The thing to pass to removeForegroundChangedListener to remove
 */
const addForegroundChangedListener = async (
  listener: () => void
): Promise<ForegroundChangedIdentifier> => {
  const keys = getVisibilityKeys();
  if (keys === null) {
    throw new Error('Cannot check foregrounded state');
  }

  document.addEventListener(keys.visibilityChange, listener);
  return listener;
};

/**
 * Removes the given listener from the foregrounded state change listeners.
 * The behavior of this function if canCheckForegrounded returns false is
 * undefined.
 *
 * @param listener The listener to remove
 */
const removeForegroundChangedListener = async (listener: ForegroundChangedIdentifier) => {
  const keys = getVisibilityKeys();
  if (keys === null) {
    throw new Error('Cannot check foregrounded state');
  }

  document.removeEventListener(keys.visibilityChange, listener);
};

/**
 * A provider for the LoginContext. This is responsible for loading the auth
 * tokens. The auth tokens will only be provided if they are reasonably fresh;
 * otherwise, this will provide the logged-out state.
 */
export const LoginProvider = ({
  children,
}: PropsWithChildren<LoginProviderProps>): React.ReactElement => {
  const valueVWC = useWritableValueWithCallbacks<LoginContextValueUnion>(() => ({
    state: 'loading',
  }));

  const setAuthTokens = useCallback(
    async (authTokens: TokenResponseConfig | null): Promise<void> => {
      const value = valueVWC.get();
      if (value.state === 'loading') {
        throw new Error('cannot setAuthTokens while loading');
      }

      if (authTokens === null) {
        if (value.state === 'logged-out') {
          return;
        }

        await Promise.all([storeAuthTokens(null), storeUserAttributes(null)]);
        setVWC(valueVWC, {
          state: 'logged-out',
        });
        return;
      }

      const userAttributes = extractUserAttributes(authTokens);
      await Promise.all([storeAuthTokens(authTokens), storeUserAttributes(userAttributes)]);
      setVWC(valueVWC, {
        state: 'logged-in',
        authTokens,
        userAttributes,
      });
    },
    [valueVWC]
  );

  const setUserAttributes = useCallback(
    async (userAttributes: UserAttributes): Promise<void> => {
      const value = valueVWC.get();
      if (value.state !== 'logged-in') {
        throw new Error('cannot setUserAttributes while not logged in');
      }

      await storeUserAttributes(userAttributes);
      setVWC(valueVWC, {
        ...value,
        userAttributes,
      });
    },
    [valueVWC]
  );

  const tryRefresh = useCallback(
    async (value: LoginContextValueLoggedIn, runningRef: { current: boolean }): Promise<void> => {
      try {
        const newTokens = await refreshTokens(value.authTokens);
        const newUserAttributes = extractUserAttributes(newTokens);
        await Promise.all([storeAuthTokens(newTokens), storeUserAttributes(newUserAttributes)]);
        if (!runningRef.current) {
          return;
        }
        setVWC(valueVWC, {
          state: 'logged-in',
          authTokens: newTokens,
          userAttributes: newUserAttributes,
        });
      } catch (e) {
        console.trace('failed to refresh, checking if we raced another tab...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!runningRef.current) {
          return;
        }
        const [newStoredAuthTokens, newStoredUserAttributes] = await Promise.all([
          retrieveAuthTokens(),
          retrieveUserAttributes(),
        ]);
        if (!runningRef.current) {
          return;
        }
        if (newStoredAuthTokens === null || newStoredUserAttributes === null) {
          console.trace('we raced another tab, but they deleted the tokens. providing logged-out');
          setVWC(valueVWC, {
            state: 'logged-out',
          });
          return;
        }
        const nowMs = await getCurrentServerTimeMS();
        if (!runningRef.current) {
          return;
        }
        if (!isTokenFresh(newStoredAuthTokens, nowMs)) {
          console.trace(
            'the other tab refreshed, but the token is already not fresh! clearing and providing logged-out'
          );
          await Promise.all([storeAuthTokens(null), storeUserAttributes(null)]);
          if (!runningRef.current) {
            return;
          }
          setVWC(valueVWC, {
            state: 'logged-out',
          });
          return;
        }
        if (newStoredAuthTokens.idToken !== value.authTokens.idToken) {
          console.trace(
            'we raced another tab, and they refreshed successfully. double checking...'
          );
          const newNow = await getCurrentServerTimeMS();
          if (!runningRef.current) {
            return;
          }
          if (isTokenFresh(newStoredAuthTokens, newNow)) {
            console.trace('the other tab refreshed successfully, providing logged-in');
            setVWC(valueVWC, {
              state: 'logged-in',
              authTokens: newStoredAuthTokens,
              userAttributes: newStoredUserAttributes,
            });
            return;
          } else {
            console.trace(
              'the other tab refreshed, but the token is already not fresh! clearing and providing logged-out'
            );
            await Promise.all([storeAuthTokens(null), storeUserAttributes(null)]);
            if (!runningRef.current) {
              return;
            }
            setVWC(valueVWC, {
              state: 'logged-out',
            });
            return;
          }
        } else {
          console.trace('local store was not changed in time, clearing and providing logged out');
          await Promise.all([storeAuthTokens(null), storeUserAttributes(null)]);
          if (!runningRef.current) {
            return;
          }
          setVWC(valueVWC, {
            state: 'logged-out',
          });
          return;
        }
      }
    },
    [valueVWC]
  );

  const runningLock = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (valueVWC.get().state !== 'loading') {
      return;
    }

    const runningRef = { current: true };
    acquireLockAndLoadFromStore();
    return () => {
      runningRef.current = false;
    };

    async function loadFromStore() {
      const [storedAuthTokens, storedUserAttributes] = await Promise.all([
        retrieveAuthTokens(),
        retrieveUserAttributes(),
      ]);
      if (!runningRef.current) {
        return;
      }

      if (storedAuthTokens === null || storedUserAttributes === null) {
        if (storedAuthTokens !== null) {
          console.trace(
            'inconsistent local storage state: have auth tokens but not user attributes; clearing tokens'
          );
          await storeAuthTokens(null);
        }
        if (storedUserAttributes !== null) {
          console.trace(
            'inconsistent local storage state: have user attributes but not auth tokens; clearing attributes'
          );
          await storeUserAttributes(null);
        }
        if (!runningRef.current) {
          return;
        }
        setVWC(valueVWC, {
          state: 'logged-out',
        });
        return;
      }

      const nowMs = await getCurrentServerTimeMS();
      if (!runningRef.current) {
        return;
      }

      if (isTokenFresh(storedAuthTokens, nowMs)) {
        setVWC(valueVWC, {
          state: 'logged-in',
          authTokens: storedAuthTokens,
          userAttributes: storedUserAttributes,
        });
        return;
      }

      if (!isRefreshable(storedAuthTokens, nowMs)) {
        console.trace('have stored login state but it is not fresh nor refreshable, clearing');
        await Promise.all([storeAuthTokens(null), storeUserAttributes(null)]);
        if (!runningRef.current) {
          return;
        }
        setVWC(valueVWC, {
          state: 'logged-out',
        });
        return;
      }

      await tryRefresh(
        {
          state: 'logged-in',
          authTokens: storedAuthTokens,
          userAttributes: storedUserAttributes,
        },
        runningRef
      );
    }

    async function acquireLockAndLoadFromStore() {
      while (runningLock.current !== null) {
        if (!runningRef.current) {
          return;
        }
        await runningLock.current;
      }
      if (!runningRef.current) {
        return;
      }
      runningLock.current = new Promise(async (resolve) => {
        try {
          await loadFromStore();
        } finally {
          runningLock.current = null;
          resolve();
        }
      });
    }
  }, [valueVWC, tryRefresh]);

  useValueWithCallbacksEffect(valueVWC, (valueRaw) => {
    if (valueRaw.state !== 'logged-in' || valueRaw.authTokens.refreshToken === null) {
      return;
    }
    const value = valueRaw;

    let timeout: NodeJS.Timeout | null = null;
    let foregroundChecker: ForegroundChangedIdentifier | null = null;
    let runningRef = { current: true };

    queueTimeoutIfForegrounded();
    return () => {
      runningRef.current = false;
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (foregroundChecker !== null) {
        removeForegroundChangedListener(foregroundChecker);
        foregroundChecker = null;
      }
    };

    async function queueTimeout() {
      if (!runningRef.current) {
        return;
      }

      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }

      const nowMs = await getCurrentServerTimeMS();
      if (!runningRef.current) {
        return;
      }

      const expiresMs = getJwtExpiration(value.authTokens.idToken);
      const refreshAtMs = expiresMs - 1000 * 60 * 5;
      if (refreshAtMs < nowMs) {
        await tryRefresh(value, runningRef);
      } else {
        const timeUntilRefreshMs = refreshAtMs - nowMs;
        timeout = setTimeout(queueTimeout, timeUntilRefreshMs);
      }
    }

    async function queueTimeoutIfForegrounded() {
      const foregroundInfoAvailable = await canCheckForegrounded();
      if (!runningRef.current) {
        return;
      }

      if (!foregroundInfoAvailable) {
        await queueTimeout();
        return;
      }

      foregroundChecker = await addForegroundChangedListener(onForegroundChanged);
      if (!runningRef.current) {
        if (foregroundChecker !== null) {
          removeForegroundChangedListener(foregroundChecker);
          foregroundChecker = null;
        }
        return;
      }

      await onForegroundChanged();
    }

    async function onForegroundChanged() {
      if (!runningRef.current) {
        if (foregroundChecker !== null) {
          removeForegroundChangedListener(foregroundChecker);
          foregroundChecker = null;
        }
        return;
      }

      const isForegroundedNow = await isForegrounded();
      if (!runningRef.current) {
        return;
      }

      if (isForegroundedNow) {
        if (timeout === null) {
          await queueTimeout();
        }
      } else {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
    }
  });

  return (
    <LoginContext.Provider
      value={useMemo(
        () => ({
          value: valueVWC,
          setAuthTokens,
          setUserAttributes,
        }),
        [valueVWC, setAuthTokens, setUserAttributes]
      )}>
      {children}
    </LoginContext.Provider>
  );
};
