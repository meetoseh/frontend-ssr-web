import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { CommandLineArgs } from '../../../CommandLineArgs';
import { createFakeCancelable } from '../../../lib/createFakeCancelable';
import { InappBrowserApp, InappBrowserAppProps } from '../components/InappBrowserApp';

export const iabCatchall = (args: CommandLineArgs) =>
  createComponentRoutes<InappBrowserAppProps>({
    path: (routerPrefix) => {
      return (url: string): boolean =>
        url.startsWith(routerPrefix) && !url.startsWith('/iab-assets', routerPrefix.length);
    },
    templatedRelativePath: '/iab/{any}',
    assetsPath: '/iab-assets',
    buildFolder: `build/routes/in_app_browser`,
    componentPath: 'src/routers/inapp_browser/components/InappBrowserApp.tsx',
    component: (props) => <InappBrowserApp {...props} />,
    body: async (bundleArgs) => {
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        return () =>
          createFakeCancelable(async () => {
            return { stylesheets };
          });
      };
    },
    docs: {
      tags: ['in_app_browser'],
      summary: `Handles requests from Facebook/Instagram in-app browsers`,
      description:
        'Due to feature unavailability on these browsers, we try to get the user to open the normal system browser or download the app.',
      operationId: `in_app_browser`,
    },
    args,
    getSitemapEntries: (routerPrefix, pump) => pump([]),
  });
