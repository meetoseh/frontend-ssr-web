import { componentRouteHandler } from '../../lib/componentRouteHandler';
import { createWebpackComponent } from '../../lib/createWebpackComponent';
import { PendingRoute } from '../../lib/route';
import { staticRouteHandler } from '../../lib/staticRouteHandler';
import { ExampleApp } from './ExampleApp';

const exampleRoute: PendingRoute = {
  methods: ['GET'],
  path: '/example',
  handler: async () => {
    const props: { initialTodos: string[] } = {
      initialTodos: ['Hello', 'World'],
    };
    await createWebpackComponent({
      componentPath: 'src/routers/management/routes/ExampleApp.tsx',
      props,
      bundlePath: 'build/example_dist/example.bundle.js',
      cssPublicPath: 'shared/management/assets/example',
    });
    return componentRouteHandler(
      async (args) => <ExampleApp {...props} />,
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

const exampleRouteBundle: PendingRoute = {
  methods: ['GET'],
  path: '/example.bundle.js',
  handler: () =>
    staticRouteHandler('build/example_dist/example.bundle.js', {
      contentType: 'text/javascript; charset=utf-8',
    }),
  docs: [],
};

const exampleCSSBundle: PendingRoute = {
  methods: ['GET'],
  path: '/assets/example/main.css',
  handler: () =>
    staticRouteHandler('build/example_dist/main.css', {
      contentType: 'text/css; charset=utf-8',
    }),
  docs: [],
};

export default [exampleRoute, exampleRouteBundle, exampleCSSBundle];
