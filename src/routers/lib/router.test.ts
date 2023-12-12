import { createFakeCancelable } from '../../lib/createFakeCancelable';
import { createEmptyRootRouter, addRouteToRootRouter, useRouterToRoute } from './router';
import { templatedPath } from './pathHelpers';

const fakeHandler = () => () => createFakeCancelable(async () => {});

test('root level simple route', () => {
  const router = createEmptyRootRouter('');
  addRouteToRootRouter(router, [], {
    methods: ['GET'],
    path: '/foo',
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/foo')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/foo')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/baz')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/baz')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo?q=5')).toBeNull();
});

test('root level templated route', () => {
  const router = createEmptyRootRouter('');
  const [path, extracted] = templatedPath(['/', 'uid', '/']);
  addRouteToRootRouter(router, [], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/oseh_u_test/')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/oseh_u_test/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/oseh_u_test/?')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/oss/')).toBeNull();
  const longString = Array(256).fill('a').join('');
  expect(useRouterToRoute(router, 'GET', `/${longString}/`)).toBeNull();
});

test('direct child simple route', () => {
  const router = createEmptyRootRouter('');
  addRouteToRootRouter(router, ['/foo'], {
    methods: ['GET'],
    path: '/bar',
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/foo/bar')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/foo/bar')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/bar')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/baz')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar/baz')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar?q=5')).toBeNull();
});

test('direct child templated route', () => {
  const router = createEmptyRootRouter('');
  const [path, extracted] = templatedPath(['/', 'uid', '/']);
  addRouteToRootRouter(router, ['/foo'], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/foo/oseh_u_test/')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/foo/oseh_u_test/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/oseh_u_test/?')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/oss/')).toBeNull();
  const longString = Array(256).fill('a').join('');
  expect(useRouterToRoute(router, 'GET', `/foo/${longString}/`)).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/oseh_u_test/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '//foo/baz/oseh_u_test/')).toBeNull();
});

test('indirect child simple route', () => {
  const router = createEmptyRootRouter('');
  addRouteToRootRouter(router, ['/foo', '/bar'], {
    methods: ['GET'],
    path: '/baz',
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/foo/bar/baz')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/foo/bar/baz')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar/baz/')).toBeNull();
});

test('indirect child templated route', () => {
  const router = createEmptyRootRouter('');
  const [path, extracted] = templatedPath(['/', 'uid', '/']);
  addRouteToRootRouter(router, ['/foo', '/bar'], {
    methods: ['GET'],
    path,
    handler: fakeHandler,
    docs: [],
  });

  expect(useRouterToRoute(router, 'GET', '/foo/bar/oseh_u_test/')).not.toBeNull();
  expect(useRouterToRoute(router, 'HEAD', '/foo/bar/oseh_u_test/')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/bar/oseh_u_test')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/foo/oseh_u_test')).toBeNull();
  expect(useRouterToRoute(router, 'GET', '/oseh_u_test')).toBeNull();
});
