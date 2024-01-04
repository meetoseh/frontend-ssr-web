/**
 * If there is a specific place we want to go after logging in, we
 * store this type of value within local storage
 */
export type LoginRedirectStoredValue = {
  /**
   * The url to redirect to after handling login tokens
   */
  url: string;

  /**
   * The unix time in milliseconds when this redirect will expire,
   * i.e., it can be ignored as the user is probably no longer in
   * the flow we were redirecting them to.
   *
   * This is specified using the local device clock, not server time.
   */
  expiresAtMS: number;
};

/**
 * The key to use for storing the login redirect value
 */
export const LOGIN_REDIRECT_KEY = 'login-redirect';

/**
 * Get the login redirect value from local storage. This is a promise
 * for consistency with the app, which requires promises to access
 * the equivalent of local storage.
 */
export const getLoginRedirect = async (): Promise<LoginRedirectStoredValue | null> => {
  const loginRedirectRaw = localStorage.getItem(LOGIN_REDIRECT_KEY);
  if (!loginRedirectRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(loginRedirectRaw);

    if (typeof parsed !== 'object') {
      throw new Error('login-redirect was not an object');
    }

    if (typeof parsed.url !== 'string') {
      throw new Error('login-redirect.url was not a string');
    }

    if (typeof parsed.expiresAtMS !== 'number') {
      throw new Error('login-redirect.expiresAtMS was not a number');
    }

    const stored: LoginRedirectStoredValue = {
      url: parsed.url,
      expiresAtMS: parsed.expiresAtMS,
    };
    if (!stored.url.startsWith(window.location.origin)) {
      throw new Error('login-redirect.url was not a valid url');
    }

    if (stored.expiresAtMS < Date.now()) {
      localStorage.removeItem(LOGIN_REDIRECT_KEY);
      return null;
    }

    return stored;
  } catch (e) {
    console.warn('login-redirect had invalid value, ignoring', e);
    localStorage.removeItem(LOGIN_REDIRECT_KEY);
    return null;
  }
};

/**
 * Set the login redirect value in local storage; may be null to
 * clear the value
 */
export const setLoginRedirect = async (value: LoginRedirectStoredValue | null): Promise<void> => {
  if (value === null) {
    localStorage.removeItem(LOGIN_REDIRECT_KEY);
    return;
  }

  localStorage.setItem(LOGIN_REDIRECT_KEY, JSON.stringify(value));
};
