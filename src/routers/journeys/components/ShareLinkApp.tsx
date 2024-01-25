import { Fragment, ReactElement, useContext, useEffect, useRef } from 'react';
import { OsehContentRef } from '../../../uikit/content/OsehContentRef';
import { OsehImageRef } from '../../../uikit/images/OsehImageRef';
import { OsehTranscriptRef } from '../../../uikit/transcripts/OsehTranscriptRef';
import styles from './SharedUnlockClassApp.module.css';
import { Callbacks, useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { ModalContext, Modals, ModalsOutlet } from '../../../uikit/contexts/ModalContext';
import { SharedUnlockedClassBody } from './SharedUnlockedClassApp';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { describeError } from '../../../uikit/components/ErrorBlock';
import { setVWC } from '../../../uikit/lib/setVWC';
import { apiFetch } from '../../../uikit/ApiConstants';
import { LoginContext, LoginProvider } from '../../../uikit/contexts/LoginContext';
import { useValuesWithCallbacksEffect } from '../../../uikit/hooks/useValuesWithCallbacksEffect';
import {
  UTM,
  useVisitorValueWithCallbacks,
} from '../../../uikit/hooks/useVisitorValueWithCallbacks';
import { convertUsingKeymap } from '../../../uikit/crud/CrudFetcher';
import { keyMap as journeyKeyMap } from '../lib/Journeys';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { sendPlausibleEvent } from '../../../uikit/lib/sendPlausibleEvent';
import { OpenGraphMetaImage } from '../../../uikit/lib/OpenGraphMetaImage';

type ShareLinkJourney = {
  /**
   * The canonical public url for this journey; we replace the url in the
   * address bar without redirecting, if we should redirect
   */
  canonicalUrl?: string;

  /**
   * For this page we always ignore any utm parameters in the URL. Instead,
   * the utm parameters are implied by the link code. We use no UTM if the
   * code is invalid.
   */
  impliedUTM: UTM;

  /**
   * Primary stable external identifier for the class
   */
  uid: string;

  /**
   * The canonical slug for the journey, if available
   */
  slug?: string;

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
};

export type ShareLinkProps = {
  /**
   * The share link code that was used
   */
  code: string;

  /**
   * The UID for the view on this share link that needs to be confirmed,
   * if one needs to be confirmed
   */
  viewUid?: string;

  /**
   * If the share code was processed server-side, i.e., we didn't ratelimit
   * the request, then this is the journey (if the code was valid) and null
   * otherwise.
   *
   * undefined if we should use phase 3 (api) to process the code.
   */
  journey: ShareLinkJourney | null | undefined;

  /**
   * The meta images for this page, if any
   */
  metaImages: OpenGraphMetaImage[];

  /**
   * The stylesheets required for this page, created by webpack
   */
  stylesheets: string[];
};

const rootFrontendUrl = (process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL ??
  process.env.ROOT_FRONTEND_URL)!;

export const ShareLinkApp = (props: ShareLinkProps): ReactElement => {
  const title =
    props.journey === undefined
      ? 'Oseh: Shared Class'
      : props.journey === null
        ? 'Oseh: Page Not Found'
        : props.journey.title;

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
        <meta property="og:title" content={title} />
        <meta
          property="og:url"
          content={
            props.journey === undefined || props.journey === null
              ? `${rootFrontendUrl}/s/${props.code}`
              : `${rootFrontendUrl}/shared/${props.journey.slug}`
          }
        />
        <meta property="og:type" content="website" />
        <meta
          name="description"
          property="og:description"
          content={
            props.journey === undefined
              ? 'A class has been shared with you'
              : props.journey === null
                ? 'That link appears to be invalid'
                : props.journey.description
          }
        />
        {props.metaImages.map((image, i) => (
          <Fragment key={i}>
            <meta property="og:image" content={image.url} />
            <meta property="og:image:width" content={image.width.toString()} />
            <meta property="og:image:height" content={image.height.toString()} />
            <meta property="og:image:type" content={image.type} />
          </Fragment>
        ))}
        <link rel="apple-touch-icon" href={`${rootFrontendUrl}/apple-touch-icon.png`} />
        <link rel="manifest" href={`${rootFrontendUrl}/manifest.json`} />
        <link rel="stylesheet" href="/fonts.css" />
        <link rel="stylesheet" href="/global.css" />
        {props.stylesheets.map((href, i) => (
          <link key={i} rel="stylesheet" href={href} />
        ))}
        <title>{title}</title>
      </head>
      <body>
        <div id="root">
          <div className={styles.container}>
            <div className={styles.background} ref={backgroundRef} />
            <div className={styles.contentContainer}>
              <ModalContext.Provider value={{ modals }}>
                <LoginProvider>
                  <ShareLinkAppBody {...props} />
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

export const ShareLinkAppBody = (
  props: Omit<ShareLinkProps, 'stylesheets' | 'metaImages'>
): ReactElement => {
  const modalContext = useContext(ModalContext);
  const loginContextRaw = useContext(LoginContext);
  const journeyVWC = useWritableValueWithCallbacks<ShareLinkJourney | null | undefined>(
    () => props.journey
  );
  const journeyError = useWritableValueWithCallbacks<ReactElement | null>(() => null);
  const visitorVWC = useVisitorValueWithCallbacks(
    useMappedValueWithCallbacks(journeyVWC, (j) => j?.impliedUTM ?? null)
  );

  useErrorModal(modalContext.modals, journeyError, 'Loading journey');

  useValuesWithCallbacksEffect([journeyVWC, loginContextRaw.value, visitorVWC], () => {
    if (window === undefined) {
      return undefined;
    }
    const journey = journeyVWC.get();
    const loginRaw = loginContextRaw.value.get();
    const visitorRaw = visitorVWC.get();

    if (journey === null) {
      window.location.assign(rootFrontendUrl);
      return undefined;
    }

    if (journey !== undefined || loginRaw.state === 'loading' || visitorRaw.loading) {
      return undefined;
    }
    const login = loginRaw.state === 'logged-in' ? loginRaw : null;
    const visitor = visitorRaw;

    let running = true;
    const cancelers = new Callbacks<undefined>();
    useApiRequestForJourney();
    return () => {
      running = false;
      cancelers.call(undefined);
    };

    async function useApiRequestForJourneyInner() {
      const controller = window?.AbortController !== undefined ? new AbortController() : null;
      const signal = controller?.signal;
      const doAbort = () => controller?.abort();
      cancelers.add(doAbort);

      const response = await apiFetch(
        '/api/1/journeys/follow_share_link',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...(visitor.uid !== null ? { Visitor: visitor.uid } : {}),
          },
          body: JSON.stringify({
            code: props.code,
          }),
          signal,
        },
        login
      );

      cancelers.remove(doAbort);

      if (!running) {
        return;
      }

      if (response.status === 404) {
        setVWC(journeyVWC, null);
        return;
      }

      if (!response.ok) {
        throw response;
      }

      const data = await response.json();
      const parsed = convertUsingKeymap(data, journeyKeyMap);
      if (running) {
        setVWC(journeyVWC, {
          canonicalUrl: undefined,
          impliedUTM: {
            source: 'oseh_app',
            medium: 'referral',
            campaign: 'share_link',
            content: parsed.uid,
            term: props.code,
          },
          uid: parsed.uid,
          slug: undefined,
          title: parsed.title,
          description: parsed.description,
          instructor: parsed.instructor.name,
          durationSeconds: 0,
          imageThumbhashDataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          backgroundImage: parsed.backgroundImage,
          transcriptRef: null,
          audio: parsed.audioContent,
        });
      }
    }

    async function useApiRequestForJourney() {
      if (!running) {
        return;
      }

      setVWC(journeyError, null);
      try {
        await useApiRequestForJourneyInner();
      } catch (e) {
        const err = await describeError(e);
        if (running) {
          setVWC(journeyError, err);
        }
      }
    }
  });

  useValuesWithCallbacksEffect([loginContextRaw.value, visitorVWC], () => {
    if (props.viewUid === undefined || window === undefined) {
      return undefined;
    }

    const loginRaw = loginContextRaw.value.get();
    if (loginRaw.state === 'loading') {
      return undefined;
    }

    const visitorRaw = visitorVWC.get();
    if (visitorRaw.loading) {
      return undefined;
    }

    const login = loginRaw.state === 'logged-in' ? loginRaw : null;
    const visitorHeader: Record<string, string> =
      visitorRaw.uid === null ? {} : { Visitor: visitorRaw.uid };
    const viewUid = props.viewUid;

    let running = true;
    const cancelers = new Callbacks<undefined>();
    confirmView();
    return () => {
      running = false;
      cancelers.call(undefined);
    };

    async function confirmViewInner() {
      const response = await apiFetch(
        '/api/1/journeys/confirm_share_link_view',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...visitorHeader,
          },
          body: JSON.stringify({
            view_uid: viewUid,
          }),
          keepalive: true,
        },
        login
      );

      if (!response.ok) {
        throw response;
      }
    }

    async function confirmView() {
      if (!running) {
        return;
      }

      try {
        await confirmViewInner();
      } catch (e) {
        if (running) {
          console.warn('failed to confirm view:', e);
        }
      }
    }
  });

  useValueWithCallbacksEffect(journeyVWC, (journey) => {
    if (journey === undefined || journey === null) {
      return undefined;
    }

    sendPlausibleEvent('pageview--frontend-ssr-web/routers/journeys/components/ShareLinkApp.tsx', {
      name: 'pageview',
      componentPath: '/frontend-ssr-web/routers/journeys/components/ShareLinkApp.tsx',
      props: {
        title: journey.title,
        instructor: journey.instructor,
        code: props.code,
      },
    });
    return undefined;
  });

  return (
    <RenderGuardedComponent
      props={journeyVWC}
      component={(journey) => <>{journey && <SharedUnlockedClassBody {...journey} />}</>}
    />
  );
};

export default ShareLinkApp;
