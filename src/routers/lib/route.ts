import * as http from 'http';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { OASPathItem } from './openapi';

/**
 * Describes a route that can be included within a router.
 */
export type Route = {
  /**
   * What HTTP methods are supported by this route, e.g., GET, POST, etc.
   * Usually only one method per route makes sense, but e.g., HEAD and GET
   * may often be supported by the same handler.
   */
  methods: string[];

  /**
   * Returns a function which returns true if the route handles the request,
   * false otherwise. Paths are grouped by routers and then attempted in order,
   * where routers are required to not be templated (i.e., they are simple hash
   * lookups). This means nested operations are not recommended. Don't do
   * /bars/:bar/bazes/:baz, instead, just do `/bars/:bar` and `/bazes/:baz`.
   * This is always possible so long as all resources have a single globally
   * unique identifier (rather than using a composite key). This has many, many
   * benefits besides faster routing. 
   * 
   * Can instead be a string, in which case this Route is converted to a special
   * implementation which allows it to be found with a dictionary lookup. Note
   * that query parameters will not match the path in this case.
   *
   * The path should always start with a leading slash, but the trailing slash
   * depends on if it is desired or not. Do not use optional trailing slashes,
   * it should either be required or disallowed.
   *
   * Prefer to use the path helpers for the implementation of this function, as
   * they are easier to read and faster than a naive implementation
   *
   * Examples:
   *
   * ```ts
   * import { templatedPath } from '../../lib/pathHelpers';
   *
   * // Matches /foo/:bar
   * const [path, extractor] = templatedPath(['/foo/', 'uid']);
   * 
   * // Matches a slash followed by any lowercase letter followed by any number,
   * // used for example purposes only. Shows how string copying can be avoided.
   * const path = (routerPrefix) => {
   *   const prefixLength = routerPrefix.length;
   *   const suffixRegex = /\/[a-z][0-9]$/;
   *   return (url) => {
        return url.length - prefixLength === 3 && suffixRegex.test(url);
   *   }
   * }
   * ```
   */
  path: string | ((routerPrefix: string) => (url: string) => boolean);

  /**
   * Returns a function which handles the given http request which matches the
   * path. It is common that the performance of a handler can be improved by
   * knowing the router prefix in advance, but that often cannot reasonably be
   * known at compile time, hence the two-step process.
   *
   * @param routerPrefix The `req.url` prior to the path component, coming from previous
   *   routers.
   * @returns A function which handles the request. Should not use `writeHead` directly
   *   in order to expose the returned status code to middleware.
   */
  handler: (
    routerPrefix: string
  ) => (req: http.IncomingMessage, res: http.ServerResponse) => CancelablePromise<void>;

  /**
   * The documentation to merge into the openapi spec.
   */
  docs: ArrayOrSingleItem<{
    /**
     * Describes the path regex as an openapi templated path so it can be merged
     * into the OASPaths object. This will be prefixed with the router's path.
     * See `pathItem` for how conflicts are resolved
     */
    templatedRelativePath: string;
    /**
     * The OAS Path Item object that describes the path. There may already be a
     * path item object for this path, in which case there must not be any
     * overlapping operations (i.e., if a POST is already defined for the
     * endpoint, but nothing else, you can define a GET here but not a POST).
     *
     * A single route may support multiple methods
     */
    pathItem: OASPathItem;
  }>;
};

export type PendingRoute = Omit<Route, 'handler'> & {
  handler: () => PromiseLike<Route['handler']> | Route['handler'];
};

type ArrayOrSingleItem<T> = T | T[];
