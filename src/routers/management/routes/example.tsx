import { ExampleApp, ExampleAppProps } from './ExampleApp';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { CommandLineArgs } from '../../../CommandLineArgs';
import { hashElementForSitemap } from '../../sitemap/lib/hashElementForSitemap';
import { createFakeCancelable } from '../../../lib/createFakeCancelable';

// add more to this array to test parallel builds performance
export default [1].map(
  (i) => (args: CommandLineArgs) =>
    createComponentRoutes<ExampleAppProps>({
      path: `/example${i}`,
      buildFolder: `build/routes/example${i}`,
      componentPath: 'src/routers/management/routes/ExampleApp.tsx',
      component: (props) => <ExampleApp {...props} />,
      body: async (bundleArgs) => {
        const baseItems: string[] = ['Hello', 'World', i.toLocaleString()];
        const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
          .filter((a) => a.localPath.endsWith('.css'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((a) => a.unprefixedPath);

        return (routerPrefix) => {
          const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
          return () =>
            createFakeCancelable(async () => {
              const items = [...baseItems, Math.random() < 0.5 ? 'A' : 'B'];
              return { initialTodos: items, stylesheets };
            });
        };
      },
      docs: {
        tags: ['example'],
        summary: `Example HTML route ${i}`,
        description: 'This is an example HTML route. It returns a simple HTML page.',
        operationId: `management_example${i}`,
      },
      args,
      getSitemapEntries: (routerPrefix, pump) =>
        pump([
          {
            path: (routerPrefix + '/example1') as `/${string}`,
            significantContentSHA512: hashElementForSitemap(
              <ExampleApp initialTodos={[]} stylesheets={[]} />
            ),
          },
        ]),
    })
);
