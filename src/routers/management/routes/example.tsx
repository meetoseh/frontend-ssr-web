import { componentRouteHandler } from '../../lib/componentRouteHandler';
import { createWebpackComponent } from '../../lib/createWebpackComponent';
import { PendingRoute } from '../../lib/route';
import { staticRouteHandler } from '../../lib/staticRouteHandler';
import { ExampleApp } from './ExampleApp';

export const exampleRoute: PendingRoute = {
  methods: ['GET'],
  path: '/example',
  handler: async () => {
    await createWebpackComponent({
      componentPath: 'src/routers/management/routes/ExampleApp.tsx',
      bundlePath: 'build/example_dist/example.bundle.js',
    });
    return componentRouteHandler(
      async (args) => <ExampleApp />,
      (routerPrefix) => ({
        bootstrapModules: [routerPrefix + '/example.bundle.js'],
      })
    );
  },
  docs: [
    {
      templatedRelativePath: '/example',
      pathItem: {
        get: {
          tags: ['example'],
          summary: 'Example HTML route',
          description: 'This is an example HTML route. It returns a simple HTML page.',
          operationId: 'management_example',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'text/html': {},
              },
            },
          },
        },
      },
    },
  ],
};

export const exampleRouteBundle: PendingRoute = {
  methods: ['GET'],
  path: '/example.bundle.js',
  handler: () =>
    staticRouteHandler('build/example_dist/example.bundle.js', {
      contentType: 'text/javascript; charset=utf-8',
    }),
  docs: [],
};
