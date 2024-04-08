import { IncomingMessage, ServerResponse } from 'http';
import { Route } from './route';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { CommandLineArgs } from '../../CommandLineArgs';
import { constructCancelablePromise } from '../../lib/CancelablePromiseConstructor';
import { createCancelablePromiseFromCallbacks } from '../../lib/createCancelablePromiseFromCallbacks';

export type TemplatedRoute = Omit<Route, 'methods' | 'path' | 'handler'> & {
  methods: Set<string>;
  path: (url: string) => boolean | CancelablePromise<boolean>;
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
   * The full path to this router. For example, /foo
   * Must not end with a slash.
   */
  prefix: string;

  /**
   * If another path segment is available, then there may be another router
   * which can handle it. For example, if the prefix is /foo
   * and the url requested is /foo/bar/baz, then the key
   * `'bar'` may be present in subrouters, which will itself have the
   * prefix `/foo/bar`.
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
   * GET: /foo/bar/baz
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
 * @param prefix The prefix for the root router, which is typically empty
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
export const addRouteToRootRouter = async (
  router: RootRouter,
  pathPrefix: string[],
  route: Route
): Promise<void> => {
  pathPrefix = pathPrefix.filter((part) => part.length > 0);
  if (typeof route.path === 'string') {
    const handler = await route.handler(`${router.prefix}${pathPrefix.join('')}`);
    for (const method of route.methods) {
      router.simplePaths[`${method}: ${router.prefix}${pathPrefix.join('')}${route.path}`] = {
        ...route,
        path: route.path,
        handler,
      };
    }
    return;
  }

  pathPrefix = cleanPathPrefix(pathPrefix);

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
    handler: await route.handler(subrouter.prefix),
    methods: new Set(route.methods),
  });
};

/**
 * If the path prefix contains only proper path segments, then this function
 * returns the original array without copying. Otherwise, copies the array,
 * splitting the path prefix into proper path segments.
 *
 * Examples:
 *  - `['/foo', '/bar']` => no change
 *  - `[/foo/bar']` => `['/foo', '/bar']`
 *  - `['/foo', '/bar/baz', '/qux']` => `['/foo', '/bar', '/baz', '/qux']`
 */
export const cleanPathPrefix = (pathPrefix: string[]): string[] => {
  let result: string[] | null = null;
  for (let i = 0; i < pathPrefix.length; i++) {
    let slashAt = pathPrefix[i].indexOf('/', 1);
    if (slashAt < 0) {
      if (result !== null) {
        result.push(pathPrefix[i]);
      }
      continue;
    }

    if (result === null) {
      result = pathPrefix.slice(0, i);
    }

    let startAt = 0;
    while (slashAt > 0) {
      result.push(pathPrefix[i].substring(startAt, slashAt));
      startAt = slashAt;
      slashAt = pathPrefix.indexOf('/', slashAt + 1);
    }
    result.push(pathPrefix[i].substring(startAt));
  }
  return result ?? pathPrefix;
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
  args: CommandLineArgs,
  router: RootRouter,
  method: string,
  url: string
): CancelablePromise<TemplatedRoute | SimpleRoute | null> => {
  const simpleKey = `${method}: ${url}`;
  const simpleRoute = router.simplePaths[simpleKey];
  if (simpleRoute !== undefined) {
    return { done: () => true, cancel: () => {}, promise: Promise.resolve(simpleRoute) };
  }

  if (!url.startsWith(router.prefix)) {
    return { done: () => true, cancel: () => {}, promise: Promise.resolve(null) };
  }

  return useNestedRouterToRoute(
    args,
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
  args: CommandLineArgs,
  router: Router,
  method: string,
  url: string,
  pathStartsAt: number,
  qmarkIndex: number
): CancelablePromise<TemplatedRoute | SimpleRoute | null> => {
  if (url[pathStartsAt] !== '/') {
    return { done: () => true, cancel: () => {}, promise: Promise.resolve(null) };
  }

  return constructCancelablePromise<TemplatedRoute | SimpleRoute | null>({
    body: async (state, resolve, reject) => {
      const canceled = createCancelablePromiseFromCallbacks(state.cancelers);

      let partEndsAt = url.indexOf('/', pathStartsAt + 1);

      // Note that we must prefer earlier indices to later indices, even if we
      // find a "match" in a later index, to maintain determinism. We are evaluating
      // the future ones in case the ones we already have fail
      let evaluating: CancelablePromise<TemplatedRoute | SimpleRoute | null>[] = [];
      const cleanup = async () => {
        for (const prom of evaluating) {
          prom.promise.catch(() => {});
          prom.cancel();
        }
        await Promise.allSettled(evaluating.map((prom) => prom.promise));
      };

      const waitForProgressOrCanceled = async () => {
        if (evaluating.length === 0 || state.finishing) {
          return;
        }

        const notDone = evaluating.filter((prom) => !prom.done());
        if (notDone.length === 0) {
          return;
        }

        await Promise.race([canceled.promise, ...notDone.map((prom) => prom.promise)]);
      };

      const sweepDone = async (): Promise<boolean> => {
        while (evaluating.length > 0 && evaluating[0].done()) {
          const first = evaluating.shift()!;
          try {
            const result = await first.promise;
            if (result !== null) {
              state.finishing = true;
              await cleanup();
              state.done = true;
              resolve(result);
              return true;
            }
          } catch (e) {
            state.finishing = true;
            await cleanup();
            state.done = true;
            reject(e);
            return true;
          }
        }

        return false;
      };

      const queuePossibleRoute = async (
        prom: CancelablePromise<TemplatedRoute | SimpleRoute | null>
      ): Promise<boolean> => {
        let seenAnswer = false;
        evaluating.push(prom);
        while (true) {
          if (state.finishing) {
            await cleanup();
            state.done = true;
            reject(new Error('canceled'));
            return true;
          }

          if (await sweepDone()) {
            return true;
          }

          // If we know that one of these routes will match, then we don't
          // want to return since there's no point in queueing more routes
          if (seenAnswer) {
            await waitForProgressOrCanceled();
            continue;
          }

          for (let i = 0; i < evaluating.length; i++) {
            if (!evaluating[i].done()) {
              continue;
            }

            try {
              const result = await evaluating[i].promise;
              if (result !== null) {
                seenAnswer = true;
                break;
              }
            } catch (e) {
              state.finishing = true;
              await cleanup();
              state.done = true;
              reject(e);
              return true;
            }
          }

          if (seenAnswer) {
            await waitForProgressOrCanceled();
            continue;
          }

          if (evaluating.length < args.pathResolveParallelism) {
            return false;
          }

          let numActuallyRunning = 0;
          for (const prom of evaluating) {
            if (!prom.done()) {
              numActuallyRunning++;
            }
          }

          if (numActuallyRunning < args.pathResolveParallelism) {
            return false;
          }

          await waitForProgressOrCanceled();
        }
      };

      if (partEndsAt !== -1 && (qmarkIndex === -1 || partEndsAt < qmarkIndex)) {
        const part = url.slice(pathStartsAt, partEndsAt);
        const subrouter = router.subrouters[part];
        if (subrouter !== undefined) {
          const subrouterResult = useNestedRouterToRoute(
            args,
            subrouter,
            method,
            url,
            partEndsAt,
            qmarkIndex
          );
          if (await queuePossibleRoute(subrouterResult)) {
            return;
          }
        }
      }

      for (let i = 0; i < router.templatedPaths.length; i++) {
        const path = router.templatedPaths[i];
        if (path.methods.has(method)) {
          const isMatch = path.path(url);
          if (isMatch === true || isMatch === false) {
            if (
              await queuePossibleRoute({
                done: () => true,
                cancel: () => {},
                promise: Promise.resolve(isMatch ? path : null),
              })
            ) {
              return;
            }
          } else {
            if (
              await queuePossibleRoute({
                done: () => isMatch.done(),
                cancel: () => isMatch.cancel(),
                promise: isMatch.promise.then((isMatch) => (isMatch ? path : null)),
              })
            ) {
              return;
            }
          }
        }
      }

      while (true) {
        if (evaluating.length === 0) {
          state.finishing = true;
          state.done = true;
          resolve(null);
          return;
        }

        if (state.finishing) {
          await cleanup();
          state.done = true;
          reject(new Error('canceled'));
          return;
        }

        await waitForProgressOrCanceled();
        if (await sweepDone()) {
          return;
        }
      }
    },
  });
};
