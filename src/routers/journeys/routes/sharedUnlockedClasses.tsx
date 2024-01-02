import { CommandLineArgs } from '../../../CommandLineArgs';
import { CancelablePromise } from '../../../lib/CancelablePromise';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { simpleUidPath } from '../../lib/pathHelpers';
import { PendingRoute } from '../../lib/route';
import { hashElementForSitemap } from '../../sitemap/lib/hashElementForSitemap';
import {
  SharedUnlockedClassApp,
  SharedUnlockedClassBody,
  SharedUnlockedClassProps,
} from '../components/SharedUnlockedClassApp';

export const sharedUnlockedClasses = async (args: CommandLineArgs): Promise<PendingRoute[]> =>
  createComponentRoutes<SharedUnlockedClassProps>({
    path: (routerPrefix: string) => {
      const pathExtractor = simpleUidPath(true)(routerPrefix);

      return (path: string): CancelablePromise<boolean> | boolean => {
        const slug = pathExtractor(path);
        return slug === 'example-slug';
      };
    },
    templatedRelativePath: '/{slug}',
    assetsPath: '/unlocked/assets',
    buildFolder: `build/routes/allOneMinuteClasses`,
    componentPath: 'src/routers/journeys/components/SharedUnlockedClassApp.tsx',
    component: (props) => <SharedUnlockedClassApp {...props} />,
    body: async (bundleArgs) => {
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        return async (): Promise<SharedUnlockedClassProps> => {
          return {
            uid: 'oseh_j_test',
            title: 'Example',
            description: 'This is a hard coded description for testing',
            stylesheets,
          };
        };
      };
    },
    docs: {
      tags: ['journeys'],
      summary: `Unlocked classes`,
      description: 'HTML pages for unlocked classes',
      operationId: `sharedUnlockedClass`,
    },
    args,
    getSitemapEntries: (routerPrefix) => ({
      done: () => true,
      cancel: () => {},
      promise: Promise.resolve([
        {
          path: (routerPrefix + '/example-slug') as `/${string}`,
          significantContentSHA512: hashElementForSitemap(
            <SharedUnlockedClassBody
              title="Example"
              description="This is a hard coded description for testing"
              uid="oseh_j_test"
            />
          ),
        },
      ]),
    }),
  });
