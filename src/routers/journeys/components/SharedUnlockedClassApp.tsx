import { ReactElement, useContext, useEffect, useRef } from 'react';
import styles from './SharedUnlockClassApp.module.css';
import { Tablet } from './Tablet';
import { OsehImageRef } from '../../../uikit/images/OsehImageRef';
import { useOauthProviderUrlsValueWithCallbacks } from '../../../uikit/hooks/useOauthProviderUrlsValueWithCallbacks';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { ModalContext, Modals, ModalsOutlet } from '../../../uikit/contexts/ModalContext';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { ProvidersListItem } from '../../../uikit/components/ProvidersList';
import { OauthProvider } from '../../../uikit/lib/OauthProvider';
import { Mobile } from './Mobile';

export type SharedUnlockedClassProps = {
  /**
   * Primary stable external identifier for the class
   */
  uid: string;

  /**
   * The canonical slug for the journey
   */
  slug: string;

  /**
   * The title, i.e., name of the class
   */
  title: string;

  /**
   * A one-paragraph description of the class
   */
  description: string;

  /**
   * The name of the instructor for the class
   */
  instructor: string;

  /**
   * The approximate duration of the class, in seconds
   */
  durationSeconds: number;

  /**
   * The background image of the journey, as a data URL
   * https://evanw.github.io/thumbhash/
   */
  imageThumbhashDataUrl: string;

  /**
   * The darkened background image for the journey
   */
  backgroundImage: OsehImageRef;

  /**
   * The stylesheets required for this page, created by webpack
   */
  stylesheets: string[];
};

/**
 * Renders the entire HTML page for an unlocked/fully shareable class. The meaningful part
 * is in SharedUnlockedClassContent
 */
export const SharedUnlockedClassApp = (props: SharedUnlockedClassProps): ReactElement => {
  const rootFrontendUrl =
    process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL ?? process.env.ROOT_FRONTEND_URL;

  const modals = useWritableValueWithCallbacks<Modals>(() => []);

  const backgroundRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (backgroundRef.current === null) {
      return;
    }
    const bknd = backgroundRef.current;

    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
    };

    function onResize() {
      bknd.style.minHeight = `${window.innerHeight}px`;
    }
  }, []);

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href={`${rootFrontendUrl}/favicon.ico`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#000000" />
        <meta property="og:site_name" content="oseh" />
        <meta property="og:title" content={props.title} />
        <meta property="og:url" content={`${rootFrontendUrl}/shared/${props.slug}`} />
        <meta property="og:type" content="website" />
        <meta name="description" property="og:description" content={props.description} />
        <link rel="apple-touch-icon" href={`${rootFrontendUrl}/apple-touch-icon.png`} />
        <link rel="manifest" href={`${rootFrontendUrl}/manifest.json`} />
        <link rel="stylesheet" href="/fonts.css" />
        <link rel="stylesheet" href="/global.css" />
        {props.stylesheets.map((href, i) => (
          <link key={i} rel="stylesheet" href={href} />
        ))}
        <title>{props.title}</title>
      </head>
      <body>
        <div id="root">
          <div className={styles.container}>
            <div className={styles.background} ref={backgroundRef} />
            <div className={styles.contentContainer}>
              <ModalContext.Provider value={{ modals }}>
                <SharedUnlockedClassBody {...props} />
              </ModalContext.Provider>
            </div>
          </div>
          <ModalsOutlet modals={modals} />
        </div>
      </body>
    </html>
  );
};

export type SharedUnlockedClassBodyDelegateProps = Omit<SharedUnlockedClassProps, 'stylesheets'> & {
  signInUrls: ValueWithCallbacks<Omit<ProvidersListItem, 'onLinkClick'>[]>;
};
/**
 * Renders the meaningful content that describes and plays the specific class.
 */
export const SharedUnlockedClassBody = (props: Omit<SharedUnlockedClassProps, 'stylesheets'>) => {
  const modalContext = useContext(ModalContext);
  const providers = useWritableValueWithCallbacks<OauthProvider[]>(() => [
    'Google',
    'SignInWithApple',
    'Direct',
  ]);

  const [signinUrlsVWC, signinUrlsErrorVWC] = useOauthProviderUrlsValueWithCallbacks(providers);

  useErrorModal(modalContext.modals, signinUrlsErrorVWC, 'Generating login urls');

  return (
    <>
      <div className={styles.tablet}>
        <Tablet {...props} signInUrls={signinUrlsVWC} />
      </div>
      <div className={styles.mobile}>
        <Mobile {...props} signInUrls={signinUrlsVWC} />
      </div>
    </>
  );
};

export default SharedUnlockedClassApp;
