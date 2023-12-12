import { IncomingMessage, ServerResponse } from 'http';
import { Route } from './route';
import { CancelablePromise } from '../../lib/CancelablePromise';

export type TemplatedRoute = Omit<Route, 'methods' | 'path' | 'handler'> & {
  methods: Set<string>;
  path: (url: string) => boolean;
  handler: (req: IncomingMessage, res: ServerResponse) => CancelablePromise<void>;
};

export type SimpleRoute = Omit<Route, 'path' | 'handler'> & {
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => CancelablePromise<void>;
};

/**
 * Describes the information required to route requests. This format is optimized
 * for fast routing, and is thus difficult to construct manually. Instead, it is
 * processed by merging routes together via the router builder.
 */
export type Router = {
  /**
   * The full path to this router. For example, https://example.com/foo
   * Must not end with a slash.
   */
  prefix: string;

  /**
   * If another path segment is available, then there may be another router
   * which can handle it. For example, if the prefix is https://example.com/foo
   * and the url requested is https://example.com/foo/bar/baz, then the key
   * `'bar'` may be present in subrouters, which will itself have the
   * prefix `https://example.com/foo/bar`.
   */
  subrouters: Record<string, Router>;

  /**
   * The paths which must be checked in order if none of the subrouters match or
   * the subrouter does not have any matching templated paths.
   */
  templatedPaths: TemplatedRoute[];
};

export type RootRouter = Router & {
  /**
   * If there are simple, non-templated paths available within this router, then
   * the method and entire url will be a key in this object. For example,
   *
   * GET: https://example.com/foo/bar/baz
   *
   * Due to how this is constructed, all simple paths can be lifted to the root
   * router, meaning they can be checked with a single dictionary lookup. If
   * they fail, only then do templated paths need to be checked.
   */
  simplePaths: Record<string, SimpleRoute>;
};

/**
 * Creates a new empty root router
 *
 * @param prefix The prefix for the root router, which is typically just the
 *   domain name, e.g., http://example.com
 * @returns A new empty root router with the given prefix
 */
export const createEmptyRootRouter = (prefix: string): RootRouter => ({
  prefix,
  subrouters: {},
  templatedPaths: [],
  simplePaths: {},
});

/**
 * Adds the given route to the given root router. This does not check if the
 * route is valid, i.e., this may overwrite an existing route or add a route
 * in a spot where it will never be reached.
 *
 * @param router The root router to add the route to
 * @param pathPrefix The path prefix for the route, e.g., ['/foo', '/bar']
 * @param route The route to add, where the url to the route is the router's prefix
 *   followed by the path prefixes and then the routes path
 */
export const addRouteToRootRouter = (
  router: RootRouter,
  pathPrefix: string[],
  route: Route
): void => {
  if (typeof route.path === 'string') {
    const handler = route.handler(router.prefix);
    for (const method of route.methods) {
      router.simplePaths[`${method}: ${router.prefix}${pathPrefix.join('')}${route.path}`] = {
        ...route,
        path: route.path,
        handler,
      };
    }
    return;
  }

  let subrouter: Router = router;
  for (const pathPrefixPart of pathPrefix) {
    let nextSubrouter = subrouter.subrouters[pathPrefixPart];
    if (nextSubrouter === undefined) {
      nextSubrouter = {
        prefix: `${subrouter.prefix}${pathPrefixPart}`,
        subrouters: {},
        templatedPaths: [],
      };
      subrouter.subrouters[pathPrefixPart] = nextSubrouter;
    }
    subrouter = nextSubrouter;
  }

  subrouter.templatedPaths.push({
    ...route,
    path: route.path(subrouter.prefix),
    handler: route.handler(subrouter.prefix),
    methods: new Set(route.methods),
  });
};

/**
 * Routes the given request using the given router to find the appropriate handler,
 * if one exists.
 *
 * @param router The router to use to route the request.
 * @param method The HTTP method to route
 * @param url The full URL to route
 * @returns The route which should handle the request, or null if no route was found.
 */
export const useRouterToRoute = (
  router: RootRouter,
  method: string,
  url: string
): TemplatedRoute | SimpleRoute | null => {
  const simpleKey = `${method}: ${url}`;
  const simpleRoute = router.simplePaths[simpleKey];
  if (simpleRoute !== undefined) {
    return simpleRoute;
  }

  if (!url.startsWith(router.prefix)) {
    return null;
  }

  return useNestedRouterToRoute(
    router,
    method,
    url,
    router.prefix.length,
    url.indexOf('?', router.prefix.length)
  );
};

/**
 * Routes using a non-root router by evaluating templated paths and subrouters.
 */
const useNestedRouterToRoute = (
  router: Router,
  method: string,
  url: string,
  pathStartsAt: number,
  qmarkIndex: number
): TemplatedRoute | SimpleRoute | null => {
  if (url[pathStartsAt] !== '/') {
    return null;
  }

  let partEndsAt = url.indexOf('/', pathStartsAt + 1);

  if (partEndsAt !== -1 && (qmarkIndex === -1 || partEndsAt < qmarkIndex)) {
    const part = url.slice(pathStartsAt, partEndsAt);
    const subrouter = router.subrouters[part];
    if (subrouter !== undefined) {
      const subrouterResult = useNestedRouterToRoute(
        subrouter,
        method,
        url,
        partEndsAt,
        qmarkIndex
      );
      if (subrouterResult !== null) {
        return subrouterResult;
      }
    }
  }

  for (let i = 0; i < router.templatedPaths.length; i++) {
    const path = router.templatedPaths[i];
    if (path.methods.has(method) && path.path(url)) {
      return path;
    }
  }

  return null;
};
