import {
  CSSProperties,
  PropsWithChildren,
  ReactElement,
  useContext,
  useEffect,
  useRef,
} from 'react';
import styles from './SharedUnlockClassApp.module.css';
import { Tablet } from './Tablet';
import { OsehImageRef } from '../../../uikit/images/OsehImageRef';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { ModalContext, Modals, ModalsOutlet } from '../../../uikit/contexts/ModalContext';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { Mobile } from './Mobile';
import { OsehContentRef } from '../../../uikit/content/OsehContentRef';
import { OsehTranscriptRef } from '../../../uikit/transcripts/OsehTranscriptRef';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { setVWC } from '../../../uikit/lib/setVWC';
import { usePlausibleEvent } from '../../../uikit/hooks/usePlausibleEvent';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';
import { OpenGraphMetaImages } from '../../../uikit/components/OpenGraphMetaImages';
import { useVisitorValueWithCallbacks } from '../../../uikit/hooks/useVisitorValueWithCallbacks';
import { LoginProvider } from '../../../uikit/contexts/LoginContext';
import { Footer } from '../../../uikit/components/footer/Footer';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useWindowSizeValueWithCallbacks } from '../../../uikit/hooks/useWindowSize';
import { useStyleVWC } from '../../../uikit/hooks/useStyleVWC';
import {
  UseCurrentTranscriptPhrasesResult,
  useCurrentTranscriptPhrases,
} from '../../../uikit/transcripts/useCurrentTranscriptPhrases';
import { useReactManagedValueAsValueWithCallbacks } from '../../../uikit/hooks/useReactManagedValueAsValueWithCallbacks';

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
   * The transcript for the journey, if available
   */
  transcriptRef: OsehTranscriptRef | null;

  /**
   * The audio for the journey
   */
  audio: OsehContentRef;

  /**
   * The meta images for this page, if any
   */
  metaImages: OpenGraphMetaImage[];

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

  usePlausibleEvent(
    'pageview--frontend-ssr-web/routers/journeys/components/SharedUnlockedClassApp.tsx',
    {
      name: 'pageview',
      componentPath: '/frontend-ssr-web/routers/journeys/components/SharedUnlockedClassApp.tsx',
      props: {
        slug: props.slug,
        instructor: props.instructor,
      },
    }
  );

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href={`${rootFrontendUrl}/favicon.ico`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#14191c" />
        <meta property="og:site_name" content="oseh" />
        <meta property="og:title" content={props.title} />
        <meta property="og:url" content={`${rootFrontendUrl}/shared/${props.slug}`} />
        <meta property="og:type" content="website" />
        <OpenGraphMetaImages images={props.metaImages} />
        <meta name="description" property="og:description" content={props.description} />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${rootFrontendUrl}/apple-touch-icon.png`}
        />
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
                <LoginProvider>
                  <VisitorWrapper>
                    <SharedUnlockedClassBody {...props} />
                  </VisitorWrapper>
                </LoginProvider>
              </ModalContext.Provider>
            </div>
          </div>
          <ModalsOutlet modals={modals} />
        </div>
      </body>
    </html>
  );
};

const VisitorWrapper = ({ children }: PropsWithChildren<object>) => {
  useVisitorValueWithCallbacks(undefined);
  return children;
};

export type SharedUnlockedClassBodyDelegateProps = Omit<
  SharedUnlockedClassProps,
  'stylesheets' | 'slug' | 'metaImages'
> & {
  transcript: ValueWithCallbacks<UseCurrentTranscriptPhrasesResult>;
};
/**
 * Renders the meaningful content that describes and plays the specific class.
 */
export const SharedUnlockedClassBody = (
  props: Omit<SharedUnlockedClassProps, 'stylesheets' | 'slug' | 'metaImages'>
) => {
  const modalContext = useContext(ModalContext);

  const transcript = useCurrentTranscriptPhrases({
    transcriptRef: useReactManagedValueAsValueWithCallbacks(props.transcriptRef),
  });
  const transcriptErrorVWC = useWritableValueWithCallbacks<ReactElement | null>(() => null);
  useValueWithCallbacksEffect(transcript, (t) => {
    setVWC(transcriptErrorVWC, t.type === 'error' ? t.error : null);
    return undefined;
  });

  useErrorModal(modalContext.modals, transcriptErrorVWC, 'Loading transcript');

  const windowSizeVWC = useWindowSizeValueWithCallbacks();

  const tabletRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const tabletStyle = useMappedValueWithCallbacks(windowSizeVWC, (size): CSSProperties => {
    if (size === null) {
      return {};
    }
    return { minHeight: `${size.height}px` };
  });
  useStyleVWC(tabletRef, tabletStyle);

  return (
    <>
      <div className={styles.tablet} style={tabletStyle.get()} ref={(r) => setVWC(tabletRef, r)}>
        <Tablet {...props} transcript={transcript} />
      </div>
      <div className={styles.mobile}>
        <Mobile {...props} transcript={transcript} />
      </div>
      <Footer />
    </>
  );
};

export default SharedUnlockedClassApp;
