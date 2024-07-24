import { ReactElement } from 'react';
import styles from './InappBrowserApp.module.css';
import { usePlausibleEvent } from '../../../uikit/hooks/usePlausibleEvent';
import { useStandardContext } from '../../../uikit/hooks/useStandardContext';
import { GridFullscreenContainer } from '../../../uikit/components/GridFullscreenContainer';
import { GridDarkGrayBackground } from '../../../uikit/components/GridDarkGrayBackground';
import { GridContentContainer } from '../../../uikit/components/GridContentContainer';
import { VerticalSpacer } from '../../../uikit/components/VerticalSpacer';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';

export type InappBrowserAppProps = {
  stylesheets: string[];
};

const rootFrontendUrl = (process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL ??
  process.env.ROOT_FRONTEND_URL)!;

/**
 * The component to render for the example route. This is rendered on the
 * server and also included in the build for the client, so it's important
 * to be careful about the imports on this file
 */
export const InappBrowserApp = (props: InappBrowserAppProps): ReactElement => {
  usePlausibleEvent(
    'pageview--frontend-ssr-web/routers/inapp_browser/components/InappBrowserApp.tsx',
    {
      name: 'pageview',
      componentPath: '/frontend-ssr-web/routers/inapp_browser/components/InappBrowserApp.tsx',
      props: {},
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
        <meta property="og:title" content="oseh : Mindfulness Made Easy" />
        <meta property="og:type" content="website" />
        <meta
          name="description"
          property="og:description"
          content="Your journey to a mindful life starts here."
        />
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
        <title>oseh : Mindfulness Made Easy</title>
      </head>
      <body>
        <div id="root">
          <Inner />
        </div>
      </body>
    </html>
  );
};

const Inner = (): ReactElement => {
  const ctx = useStandardContext();

  return (
    <GridFullscreenContainer windowSizeImmediate={ctx.windowSizeImmediate}>
      <GridDarkGrayBackground />
      <GridContentContainer
        contentWidthVWC={ctx.contentWidth}
        gridSizeVWC={ctx.windowSizeImmediate}
        justifyContent="flex-start">
        <VerticalSpacer height={32} />
        <div className={styles.top}>🌟 Reclaim your Calm</div>
        <VerticalSpacer height={0} flexGrow={1} />
        <img
          src="/iab/static/dylan-iab-342w@3x.jpeg"
          alt="Dylan Werner"
          width={1042}
          height={739}
          className={styles.img}
        />
        <VerticalSpacer height={0} flexGrow={1} />
        <div className={styles.header}>Experience Oseh right now</div>
        <VerticalSpacer height={4} flexGrow={1} maxHeight={16} />
        <div className={styles.message}>
          Tap the three dots in the upper right and choose <strong>Open in External Browser</strong>
          , or install our app
        </div>
        <VerticalSpacer height={0} flexGrow={1} />
        <DownloadAppLinks tracking justify={{ type: 'react-rerender', props: 'flex-end' }} />
        <VerticalSpacer height={0} flexGrow={1} />
      </GridContentContainer>
    </GridFullscreenContainer>
  );
};

export default InappBrowserApp;
