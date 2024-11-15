import { createFakeCancelable } from '../../lib/createFakeCancelable';
import {
  createEmptyRootRouter,
  addRouteToRootRouter,
  useRouterToRoute,
  cleanPathPrefix,
} from './router';
import { templatedPath } from './pathHelpers';
import { CommandLineArgs } from '../../CommandLineArgs';
import { constructCancelablePromise } from '../../lib/CancelablePromiseConstructor';
import { Route } from './route';

const fakeHandler = () => () => createFakeCancelable(async () => {});
const args: CommandLineArgs = {
  serve: true,
  artifacts: 'reuse',
  buildParallelism: 1,
  pathResolveParallelism: 3,
  docsOnly: false,
};

test('root level simple route', async () => {
  const router = createEmptyRootRouter('');
  await addRouteToRootRouter(router, [], {
    methods: ['GET'],
    path: '/foo',
    handler: fakeHandler,
    docs: [],
  });

  expect(await useRouterToRoute(args, router, 'GET', '/foo').promise).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/baz').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/baz').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo?q=5').promise).toBeNull();
});

test('root level templated route', async () => {
  const router = createEmptyRootRouter('');
  const path = templatedPath(['/', 'uid', '/'])[0];
  await addRouteToRootRouter(router, [], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(await useRouterToRoute(args, router, 'GET', '/oseh_u_test/').promise).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/oseh_u_test/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/oseh_u_test/?').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/oss/').promise).toBeNull();
  const longString = Array(256).fill('a').join('');
  expect(await useRouterToRoute(args, router, 'GET', `/${longString}/`).promise).toBeNull();
});

test('direct child simple route', async () => {
  const router = createEmptyRootRouter('');
  await addRouteToRootRouter(router, ['/foo'], {
    methods: ['GET'],
    path: '/bar',
    handler: fakeHandler,
    docs: [],
  });

  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar').promise).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo/bar').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/bar').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/baz').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/baz').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar?q=5').promise).toBeNull();
});

test('direct child templated route', async () => {
  const router = createEmptyRootRouter('');
  const path = templatedPath(['/', 'uid', '/'])[0];
  await addRouteToRootRouter(router, ['/foo'], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(await useRouterToRoute(args, router, 'GET', '/foo/oseh_u_test/').promise).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo/oseh_u_test/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/oseh_u_test/?').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/oss/').promise).toBeNull();
  const longString = Array(256).fill('a').join('');
  expect(await useRouterToRoute(args, router, 'GET', `/foo/${longString}/`).promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/oseh_u_test/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '//foo/baz/oseh_u_test/').promise).toBeNull();
});

test('indirect child simple route', async () => {
  const router = createEmptyRootRouter('');
  await addRouteToRootRouter(router, ['/foo', '/bar'], {
    methods: ['GET'],
    path: '/baz',
    handler: fakeHandler,
    docs: [],
  });

  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/baz').promise).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo/bar/baz').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/baz/').promise).toBeNull();
});

test('indirect child templated route', async () => {
  const router = createEmptyRootRouter('');
  const path = templatedPath(['/', 'uid', '/'])[0];
  await addRouteToRootRouter(router, ['/foo', '/bar'], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(
    await useRouterToRoute(args, router, 'GET', '/foo/bar/oseh_u_test/').promise
  ).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo/bar/oseh_u_test/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/oseh_u_test').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/oseh_u_test').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/oseh_u_test').promise).toBeNull();
});

test('routes finish out of order', async () => {
  const router = createEmptyRootRouter('');
  const createDelayedRoute = (delay: number): Route => ({
    methods: ['GET'],
    path: () => () =>
      constructCancelablePromise({
        body: async (state, resolve) => {
          await new Promise((r) => setTimeout(r, delay));
          state.finishing = true;
          state.done = true;
          resolve(true);
        },
      }),
    handler: fakeHandler,
    docs: [
      {
        templatedRelativePath: `/test-${delay}`,
        getSitemapEntries: () => createFakeCancelable(async () => {}),
        pathItem: {},
      },
    ],
  });

  const route1 = createDelayedRoute(200);
  const route2 = createDelayedRoute(100);
  await addRouteToRootRouter(router, [], route1);
  await addRouteToRootRouter(router, [], route2);
  const routed = await useRouterToRoute(args, router, 'GET', '/').promise;
  expect(routed).not.toBeNull();
  expect((routed as any).docs[0].templatedRelativePath).toBe(
    (route1 as any).docs[0].templatedRelativePath
  );
});

test('templated paths within subrouter without prefix', async () => {
  const router = createEmptyRootRouter('');
  await addRouteToRootRouter(router, ['/shared', ''], {
    methods: ['GET'],
    path: () => () => true,
    handler: fakeHandler,
    docs: [],
  });
  expect(await useRouterToRoute(args, router, 'GET', '/shared/test').promise).not.toBeNull();
});

test('clean path prefix no change', () => {
  const original = ['/foo', '/bar'];
  const result = cleanPathPrefix(original);
  expect(result).toEqual(['/foo', '/bar']);
  expect(result).toBe(original);
});

test('clean path prefix split 1', () => {
  const original = ['/foo/bar'];
  const result = cleanPathPrefix(original);
  expect(result).toEqual(['/foo', '/bar']);
  expect(result).not.toBe(original);
  expect(original).toEqual(['/foo/bar']);
});

test('clean path prefix split in middle', () => {
  const original = ['/foo', '/bar/baz', '/qux'];
  const result = cleanPathPrefix(original);
  expect(result).toEqual(['/foo', '/bar', '/baz', '/qux']);
  expect(result).not.toBe(original);
  expect(original).toEqual(['/foo', '/bar/baz', '/qux']);
});

test('indirect child templated route via joint path', async () => {
  const router = createEmptyRootRouter('');
  const path = templatedPath(['/', 'uid', '/'])[0];
  await addRouteToRootRouter(router, ['/foo/bar'], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(
    await useRouterToRoute(args, router, 'GET', '/foo/bar/oseh_u_test/').promise
  ).not.toBeNull();
  expect(await useRouterToRoute(args, router, 'HEAD', '/foo/bar/oseh_u_test/').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/bar/oseh_u_test').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/foo/oseh_u_test').promise).toBeNull();
  expect(await useRouterToRoute(args, router, 'GET', '/oseh_u_test').promise).toBeNull();
});
