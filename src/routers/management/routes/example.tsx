import { ExampleApp, ExampleAppProps } from './ExampleApp';
import { createComponentRoutes } from '../../lib/createComponentRoutes';
import { CommandLineArgs } from '../../../CommandLineArgs';

export default (args: CommandLineArgs) =>
  createComponentRoutes<ExampleAppProps>({
    path: '/example',
    buildFolder: 'build/routes/example',
    componentPath: 'src/routers/management/routes/ExampleApp.tsx',
    component: (props) => <ExampleApp {...props} />,
    body: async (bundleArgs) => {
      const baseItems: string[] = ['Hello', 'World'];
      const unprefixedStylesheets = Object.values(bundleArgs.assetsByName)
        .filter((a) => a.localPath.endsWith('.css'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.unprefixedPath);

      return (routerPrefix) => {
        const stylesheets = unprefixedStylesheets.map((href) => `${routerPrefix}${href}`);
        return async () => {
          const items = [...baseItems, Math.random() < 0.5 ? 'A' : 'B'];
          return { initialTodos: items, stylesheets };
        };
      };
    },
    docs: {
      tags: ['example'],
      summary: 'Example HTML route',
      description: 'This is an example HTML route. It returns a simple HTML page.',
      operationId: 'management_example',
    },
    args,
  });
