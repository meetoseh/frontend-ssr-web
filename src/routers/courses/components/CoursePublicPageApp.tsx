import { CSSProperties, ReactElement, useContext, useEffect } from 'react';
import { OpenGraphMetaImages } from '../../../uikit/components/OpenGraphMetaImages';
import { OsehContentRef } from '../../../uikit/content/OsehContentRef';
import { ModalContext, Modals, ModalsOutlet } from '../../../uikit/contexts/ModalContext';
import { OsehImageRef } from '../../../uikit/images/OsehImageRef';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';
import { OsehTranscriptRef } from '../../../uikit/transcripts/OsehTranscriptRef';
import { LoginProvider } from '../../../uikit/contexts/LoginContext';
import styles from './CoursePublicPageApp.module.css';
import { useWindowSizeValueWithCallbacks } from '../../../uikit/hooks/useWindowSize';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useStyleVWC } from '../../../uikit/hooks/useStyleVWC';
import { setVWC } from '../../../uikit/lib/setVWC';
import { Mobile } from './Mobile';
import { Desktop } from './Desktop';
import {
  OsehImageStateRequestHandler,
  useOsehImageStateRequestHandler,
} from '../../../uikit/images/useOsehImageStateRequestHandler';
import { ProvidersListItem } from '../../../uikit/components/ProvidersList';
import { OauthProvider } from '../../../uikit/lib/OauthProvider';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { useOauthProviderUrlsValueWithCallbacks } from '../../../uikit/hooks/useOauthProviderUrlsValueWithCallbacks';
import { Footer } from '../../../uikit/components/footer/Footer';
import {
  OsehTranscriptResult,
  useOsehTranscriptValueWithCallbacks,
} from '../../../uikit/transcripts/useOsehTranscriptValueWithCallbacks';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { usePlausibleEvent } from '../../../uikit/hooks/usePlausibleEvent';

export type CoursePublicPageJourney = {
  /** The title of the journey */
  title: string;
  /** The description for the journey */
  description: string;
  /** The length of the journey, in seconds */
  durationSeconds: number;
};

export type CoursePublicPageAppProps = {
  /** The primary stable external identifier for the series */
  uid: string;

  /** The canonical slug for the series, which should be used in the URL */
  slug: string;

  /** The title for the series */
  title: string;

  /** The name of the instructor for the series */
  instructor: string;

  /** The description for the series */
  description: string;

  /** The data url to use while the hero image is loading */
  heroThumbhashDataURL: string;

  /** The hero image to load */
  heroImage: OsehImageRef;

  /** The data url to use for the cover image before the video is ready */
  coverImageThumbhashDataURL: string;

  /** The intro video for the series */
  seriesIntroRef: OsehContentRef;

  /** The transcript for the series intro, if available */
  transcriptRef: OsehTranscriptRef | null;

  /** The journeys that are part of the series */
  journeys: CoursePublicPageJourney[];

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
 * Renders the entire HTML page for a course. This is primarily a marketing
 * page; the actual course journeys are not playable here, only the course
 * intro.
 */
export const CoursePublicPageApp = (props: CoursePublicPageAppProps): ReactElement => {
  const rootFrontendUrl = (process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL ??
    process.env.ROOT_FRONTEND_URL)!;

  const modals = useWritableValueWithCallbacks<Modals>(() => []);
  const backgroundRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const windowSizeVWC = useWindowSizeValueWithCallbacks();
  const backgroundStyleVWC = useMappedValueWithCallbacks(
    windowSizeVWC,
    (size): CSSProperties =>
      size === null ? { minHeight: '100vh' } : { minHeight: `${size.height}px` }
  );
  useStyleVWC(backgroundRef, backgroundStyleVWC);

  usePlausibleEvent(
    'pageview--frontend-ssr-web/routers/courses/components/CoursePublicPageApp.tsx',
    {
      name: 'pageview',
      componentPath: '/frontend-ssr-web/routers/courses/components/CoursePublicPageApp.tsx',
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
        <meta property="og:url" content={`${rootFrontendUrl}/shared/series/${props.slug}`} />
        <meta property="og:type" content="website" />
        <meta name="description" property="og:description" content={props.description} />
        <OpenGraphMetaImages images={props.metaImages} />
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
            <div
              className={styles.background}
              style={backgroundStyleVWC.get()}
              ref={(r) => setVWC(backgroundRef, r)}
            />
            <div className={styles.contentContainer}>
              <ModalContext.Provider value={{ modals }}>
                <LoginProvider>
                  <CoursePublicPageBody {...props} />
                  <Footer />
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

export type CoursePublicPageBodyProps = Omit<
  CoursePublicPageAppProps,
  'stylesheets' | 'metaImages'
>;

export type CoursePublicPageBodyComponentProps = CoursePublicPageBodyProps & {
  /** The handler for downloading images, to improve reuse */
  imageHandler: OsehImageStateRequestHandler;

  /** The transcript for the video, if available */
  transcript: ValueWithCallbacks<OsehTranscriptResult>;

  /** True if the component is being rendered, false if hidden, null if still on server */
  visibleVWC: ValueWithCallbacks<boolean | null>;

  /** How the user can signup */
  signInUrls: ValueWithCallbacks<Omit<ProvidersListItem, 'onLinkClick'>[]>;
};

const CoursePublicPageBody = (props: CoursePublicPageBodyProps): ReactElement => {
  const modalContext = useContext(ModalContext);
  const imageHandler = useOsehImageStateRequestHandler({});

  const versionVWC = useWritableValueWithCallbacks<'desktop' | 'mobile' | null>(() => null);
  useEffect(() => {
    if (window === undefined) {
      return;
    }

    const query = matchMedia('(min-width: 768px)');
    query.addEventListener('change', onQueryChange);
    onQueryChange();
    return () => {
      query.removeEventListener('change', onQueryChange);
    };

    function onQueryChange() {
      const match = query.matches;
      versionVWC.set(match ? 'desktop' : 'mobile');
    }
  }, [versionVWC]);

  const providers = useWritableValueWithCallbacks<OauthProvider[]>(() => [
    'Direct',
    'Google',
    'SignInWithApple',
  ]);
  const [signinUrlsVWC, signinUrlsErrorVWC] = useOauthProviderUrlsValueWithCallbacks(providers, {
    tracking: true,
  });

  useErrorModal(modalContext.modals, signinUrlsErrorVWC, 'Generating login urls');

  const transcript = useOsehTranscriptValueWithCallbacks({
    type: 'react-rerender',
    props: props.transcriptRef,
  });

  const transcriptErrorVWC = useWritableValueWithCallbacks<ReactElement | null>(() => null);
  useValueWithCallbacksEffect(transcript, (t) => {
    if (props.transcriptRef === null) {
      return undefined;
    }
    setVWC(transcriptErrorVWC, t.type === 'error' ? t.error : null);
    return undefined;
  });
  useErrorModal(modalContext.modals, transcriptErrorVWC, 'Loading transcript');

  return (
    <>
      <div className={styles.mobile}>
        <Mobile
          {...props}
          imageHandler={imageHandler}
          visibleVWC={useMappedValueWithCallbacks(versionVWC, (v) =>
            v === null ? null : v === 'mobile'
          )}
          signInUrls={signinUrlsVWC}
          transcript={transcript}
        />
      </div>
      <div className={styles.desktop}>
        <Desktop
          {...props}
          imageHandler={imageHandler}
          visibleVWC={useMappedValueWithCallbacks(versionVWC, (v) =>
            v === null ? null : v === 'desktop'
          )}
          signInUrls={signinUrlsVWC}
          transcript={transcript}
        />
      </div>
    </>
  );
};

export default CoursePublicPageApp;
