export type PlausibleEventProps = Record<string, string | number | boolean>;

export type PlausibleEventPageViewArgs = {
  /**
   * The name of the event. `pageview` is a special event type in plausible,
   * all others are custom events
   */
  name: 'pageview';

  /**
   * The path to the highest level meaningful component on the page.
   * For example, if rendering is being handled by
   * routers/management/routes/example.tsx, then the `componentPath`
   * would be set to `/frontend-ssr-web/routers/management/routes/example.tsx`.
   *
   * We use component URLs for tracking rather than the actual page URL
   * for two reasons:
   * 1. It works better with mobile
   * 2. It allows us to use the URL for various technical purposes (e.g,
   *    shortlinks, state, etc.)
   */
  componentPath: string;

  /**
   * Additional properties to send with the event. Only strings, numbers,
   * and booleans can be sent. No nested objects or arrays. A maximum of
   * 30 properties per event can be sent, each name can have at most 300
   * characters, and the values can have at most 2000 characters. Cannot
   * include personally identifiable information (PII).
   *
   * Typically, this would be used to include the props to the componentUrl
   * where relevant, e.g., the title/uid of the journey being rendered. It
   * would also usually include if the user is logged in or not.
   */
  props?: PlausibleEventProps;

  /**
   * Normally, if an error occurs while sending the event, we catch it and
   * ignore it. This is because it's not critical that the event is sent,
   * and we don't want to break the user experience if it fails. However,
   * if you want to know if the event failed, you can set this to true,
   * but you must handle the error yourself.
   */
  noCatch?: boolean;
};

export type PlausibleEventCustomArgs = {
  name: string;
  props?: PlausibleEventProps;
  noCatch?: boolean;
};

export type PlausibleEventArgs = PlausibleEventPageViewArgs | PlausibleEventCustomArgs;

const _seenIds = new Set<string>();
const isProduction = process.env.CLIENT_VISIBLE_ENVIRONMENT === 'production';
const plausibleDomain = (() => {
  const rootFrontendURL = process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL;
  if (!rootFrontendURL) {
    // on the server
    return '';
  }
  const url = new URL(rootFrontendURL);
  url.port = '443';
  return url.hostname;
})();

let __componentPath: string | undefined = undefined;

/**
 * Sends the given plausible event to the plausible server, if running in
 * production. In development, this just logs the event to the console.
 *
 * @param idempotency A unique identifier for the event. If the same idempotency
 *   is used twice in the same page, the second is ignored. This allows standard
 *   useEffects() without constantly guarding with a ref and with less risk of
 *   react rerenders causing duplicate events. This is usually _not_ a random value
 *   unless the action is expected to occur multiple times (e.g., a button click)
 *   and we want to track each time it occurs (which we usually don't). All non-random
 *   values must be documented in the backend repo under docs/plausible/events.md.
 *   If undefined, the event will always be sent.
 * @param args The event to send. The event name and corresponding page url and props
 *   must be documented under docs/plausible/events.md. For custom events, the
 *   componentPath is omitted from these args as it's taken from the last pageview
 *   event (the event is dropped if there is no last pageview event).
 * @see https://plausible.io/docs/custom-props/introduction
 * @see usePlausibleEvent
 */
export const sendPlausibleEvent = async (
  idempotency: string | undefined,
  args: PlausibleEventArgs
): Promise<void> => {
  if (idempotency !== undefined) {
    if (_seenIds.has(idempotency)) {
      return;
    }
    _seenIds.add(idempotency);
  }

  if (!isProduction) {
    console.log('Plausible event (suppressed: dev)', args);
    return;
  }

  if (localStorage.getItem('plausible_ignore') === 'true') {
    console.log('Plausible event (suppressed: opt-out)', args);
    return;
  }

  const windowHostname = window.location.hostname;
  if (
    /^localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(windowHostname) ||
    'file:' === window.location.protocol
  ) {
    console.log('Plausible event (suppressed: localhost)', args);
    return;
  }

  if (
    (window as any)._phantom ||
    (window as any).__nightmare ||
    window.navigator.webdriver ||
    (window as any).Cypress
  ) {
    console.log('Plausible event (suppressed: bot)', args);
    return;
  }

  let componentPath;
  if (args.name === 'pageview') {
    const pageviewArgs = args as PlausibleEventPageViewArgs;
    __componentPath = pageviewArgs.componentPath;
    componentPath = pageviewArgs.componentPath;
  } else {
    if (__componentPath === undefined) {
      console.log('Plausible event (suppressed: no last pageview)', args);
      return;
    }
    componentPath = __componentPath;
  }

  try {
    await fetch('https://plausible.io/api/event', {
      method: 'POST',
      body: JSON.stringify({
        domain: plausibleDomain,
        name: args.name,
        url: window.location.protocol + '//' + plausibleDomain + componentPath,
        ...(args.props === undefined ? {} : { props: args.props }),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
    });
  } catch (e) {
    if (!args.noCatch) {
      console.error('Failed to send plausible event', e);
    } else {
      throw e;
    }
  }
};
