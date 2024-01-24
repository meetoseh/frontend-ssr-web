import { ReactElement } from 'react';
import { RouteBodyArgs } from './RouteBodyArgs';
import { PendingRoute, RouteDocsGetSitemapEntries } from './route';
import { createWebpackComponent } from './createWebpackComponent';
import { componentRouteHandler } from './componentRouteHandler';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { staticRouteHandler } from './staticRouteHandler';
import { OASPathItem } from './openapi';
import { simpleRouteHandler } from './simpleRouteHandler';
import { finishWithServerError } from './finishWithServerError';
import { CommandLineArgs } from '../../CommandLineArgs';
import { CancelablePromise } from '../../lib/CancelablePromise';
import crypto from 'crypto';
import { parseContentType } from './contentType';
import { copyWithStringSubstitution } from './copyWithStringSubstitution';
import { IncomingMessage, ServerResponse } from 'http';
import { constructCancelablePromise } from '../../lib/CancelablePromiseConstructor';

/**
 * This string is used as the prefix for the css build path when creating
 * component routes. When preparing for serving assets from a particular
 * route prefix, we create a copy of the css files with the correct prefix
 * using string substitution
 */
const ROUTE_PREFIX_IDENTIFIER = '/Gm9UPI0xlReHHzDBrsp-pA-Hji83bJDxcKoeRZMCyiI';

const DEV_CLS_SCRIPT = `
let cls = 0;
new PerformanceObserver((entryList) => {
  for (const entry of entryList.getEntries()) {
    if (!entry.hadRecentInput) {
      cls += entry.value;
      console.log('Current CLS value:', cls, entry);
    }
  }
}).observe({type: 'layout-shift', buffered: true});
`;

type BundledAsset = {
  /** The name of the asset, e.g., `main.css` */
  name: string;

  /**
   * The served name of the asset, which includes the hash, e.g.,
   * `main.d587bbd6e38337f5accd.css`
   */
  servedName: string;

  /** The content hash of the file, which will be included in the served name */
  contentHash: string;

  /**
   * The path to the asset on the local filesystem, relative to the project
   * root, before substituting paths for the correct route prefix.
   * For example, `build/routers/example/main.d587bbd6e38337f5accd.css`
   */
  localPath: string;

  /**
   * The route path used to serve this asset, e.g.,
   * `/example-assets/main.d587bbd6e38337f5accd.css`
   */
  unprefixedPath: string;

  /**
   * The URL path after the router prefix that goes to the asset, e.g.,
   * `/example-assets/main.css`
   */
  suffix: string;

  /**
   * The content-type that the asset is served with, e.g., `text/css; charset=utf-8`
   */
  contentType: string;
};

/**
 * The arguments forwarded to the body function. related to what was produced by
 * webpack during bundling.
 */
export type BundleArgs = {
  /**
   * All files that were emitted by the bundler, keyed by name.
   */
  assetsByName: Record<string, BundledAsset>;

  /**
   * The same assets as `assetsByName`, but instead keyed by the URL path
   * after the router prefix that goes to the asset, e.g.,
   * `/example-assets/main.css`. This is more useful for serving the assets
   */
  assetsBySuffix: Record<string, BundledAsset>;
};

export type CreateComponentRoutesArgs<T extends object> = (
  | {
      /**
       * This is the path for the route that generates the HTML page which
       * is produced by the component.
       */
      path: string;

      /**
       * The path prefix for the routes used to serve the assets for the
       * component, e.g., the JS bundle and CSS files.
       *
       * Defaults to `${path}-assets` if path is a string, otherwise
       * this is required.
       */
      assetsPath?: string;
    }
  | {
      path: (routerPrefix: string) => (url: string) => CancelablePromise<boolean> | boolean;
      /**
       * Used for generating the docs on the main route.
       *
       * Describes the path function as an openapi templated path so it can be merged
       * into the OASPaths object. This will be prefixed with the router's path.
       * See `pathItem` in `OASComponents` for how conflicts are resolved
       */
      templatedRelativePath: string;
      assetsPath: string;
    }
) & {
  /**
   * The command line arguments passed to the program
   */
  args: CommandLineArgs;

  /**
   * The folder where we emit the bundle, relative to the project root,
   * e.g., `build/routers/example`
   */
  buildFolder: string;

  /**
   * The path to the file containing the component, relative to the project
   * root. Generally starts with `src/routers`. Must contain a default export
   * that is a React component.
   */
  componentPath: string;

  /**
   * A function which simply renders the component with the given prompts. This
   * is specified rather than generated dynamically in order to improve static
   * analysis. However, this is only run on the server, so the callee has no freedom
   * in how this is implemented.
   */
  component: (props: T) => ReactElement;

  /**
   * A function which returns the props to use to render the component. The props
   * are used to render the component on the server, and are also serialized and
   * passed to the client for hydration
   */
  body: (
    bundleArgs: BundleArgs
  ) => Promise<(routerPrefix: string) => (args: RouteBodyArgs) => CancelablePromise<T>>;

  /**
   * The documentation for the route serving the component.
   */
  docs: Omit<OASPathItem, 'responses'>;

  /**
   * Generates the sitemap entries for the primary route.
   * @see Route for details
   */
  getSitemapEntries: RouteDocsGetSitemapEntries;
};

const normalizePath = (p: string): string => {
  if (path.sep === '\\') {
    return p.replace(/\\/g, '/');
  }
  return p;
};

/**
 * Constructs the required routes to server the given component at the
 * given path, with assets servered at the given assets path (or
 * `${path}-assets` if assetsPath is not specified).
 *
 * This requires generating a bundle for the component via webpack,
 * which produces adjacent public files,
 */
export const createComponentRoutes = async <T extends object>({
  path: routePath,
  assetsPath,
  buildFolder,
  componentPath,
  component,
  body,
  docs,
  args,
  getSitemapEntries,
  ...rest
}: CreateComponentRoutesArgs<T>): Promise<PendingRoute[]> => {
  const realAssetsPath = assetsPath ?? `${routePath}-assets`;

  let outerBundleArgs: BundleArgs | undefined = undefined;
  let bundleArgsLock: Promise<void> | undefined = undefined;

  const initBundleArgs = async (): Promise<BundleArgs> => {
    const realInitAssets = async () => {
      const folder = path.resolve(buildFolder);
      const filenames = await fs.promises.readdir(folder);
      const bundle: BundleArgs = {
        assetsByName: {},
        assetsBySuffix: {},
      };
      const addBundledAsset = (asset: BundledAsset) => {
        bundle.assetsByName[asset.name] = asset;
        bundle.assetsBySuffix[asset.suffix] = asset;
      };

      for (const filename of filenames) {
        if (fs.lstatSync(path.join(folder, filename)).isDirectory()) {
          continue;
        }

        const filenameExt = path.extname(filename);
        const mimeType = mime.lookup(filenameExt);
        if (mimeType === false) {
          throw new Error(`Unknown MIME type for file ${filename} in ${folder}`);
        }
        const contentType = (() => {
          if (
            filenameExt === '.css' ||
            filenameExt === '.js' ||
            filenameExt === '.md' ||
            filenameExt === '.txt'
          ) {
            return mimeType + '; charset=utf-8';
          }
          return mimeType;
        })();
        const filenameParts = filename.split('.');
        const contentHash = filenameParts[1];
        const filenameWithoutContentHash =
          filenameParts[0] + '.' + filenameParts.slice(2).join('.');

        addBundledAsset({
          name: normalizePath(filenameWithoutContentHash),
          servedName: normalizePath(filename),
          contentHash,
          localPath: path.join(folder, filename),
          unprefixedPath: normalizePath(path.join(realAssetsPath, filename)),
          suffix: '/' + normalizePath(filename),
          contentType,
        });
      }
      outerBundleArgs = bundle;
      return bundle;
    };

    while (bundleArgsLock !== undefined) {
      await bundleArgsLock;
    }

    if (outerBundleArgs !== undefined) {
      return outerBundleArgs;
    }

    let releaseLock = () => {};
    bundleArgsLock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const assets = await realInitAssets();
    outerBundleArgs = assets;
    bundleArgsLock = undefined;
    releaseLock();
    return assets;
  };

  // By moving this call you can make the function synchronous,
  // in which case the bundle args are only created when the individual
  // routes are realized. However, it's better for the build step to
  // do this first if we're building anyway, since then we avoid tricking
  // it into thinking we can actually build these routes concurrently
  if (args.artifacts === 'rebuild') {
    await createWebpackComponent({
      componentPath,
      bundleFolder: buildFolder,
      cssPublicPath: ROUTE_PREFIX_IDENTIFIER,
    });
    await initBundleArgs();
  }

  return [
    {
      methods: ['GET'],
      path: () => routePath,
      handler: async (_: CommandLineArgs) => {
        if (outerBundleArgs === undefined) {
          outerBundleArgs = await initBundleArgs();
        }
        const bundleArgs = outerBundleArgs;
        const bootstrapModules = Object.values(bundleArgs.assetsByName)
          .filter((a) => a.localPath.endsWith('js'))
          .map((a) => normalizePath(a.unprefixedPath))
          .sort();

        const bodyReadyForPrefix = await body(bundleArgs);
        return componentRouteHandler(
          (routerPrefix) => {
            const realBody = bodyReadyForPrefix(routerPrefix);
            return (args) =>
              constructCancelablePromise({
                body: async (state, resolve, reject) => {
                  if (state.finishing) {
                    if (!state.done) {
                      state.done = true;
                      reject(new Error('canceled'));
                    }
                    return;
                  }

                  const propsCancelable = realBody(args);
                  state.cancelers.add(propsCancelable.cancel);
                  if (state.finishing) {
                    propsCancelable.cancel();
                  }
                  try {
                    const props = await propsCancelable.promise;
                    const element = component(props);
                    state.finishing = true;
                    state.done = true;
                    resolve({
                      element,
                      props,
                    });
                  } catch (e) {
                    state.finishing = true;
                    state.done = true;
                    reject(e);
                  } finally {
                    state.cancelers.remove(propsCancelable.cancel);
                  }
                },
              });
          },
          (routerPrefix) => ({
            bootstrapModules: bootstrapModules.map((m) => routerPrefix + m),
            bootstrapScriptContent: process.env.ENVIRONMENT === 'dev' ? DEV_CLS_SCRIPT : undefined,
          })
        );
      },
      docs: [
        {
          templatedRelativePath:
            typeof routePath === 'string' ? routePath : (rest as any).templatedRelativePath,
          getSitemapEntries,
          pathItem: {
            get: {
              ...docs,
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
    },
    {
      methods: ['GET'],
      path: async () => {
        if (outerBundleArgs === undefined) {
          outerBundleArgs = await initBundleArgs();
        }
        const bundleArgs = outerBundleArgs;

        return (routerPrefixRaw: string) => {
          const realPrefix = routerPrefixRaw + realAssetsPath;
          const prefixLength = realPrefix.length;

          return (url: string): boolean => {
            const suffix = url.substring(prefixLength);
            return suffix in bundleArgs.assetsBySuffix;
          };
        };
      },
      handler: async () => {
        if (outerBundleArgs === undefined) {
          outerBundleArgs = await initBundleArgs();
        }
        const bundleArgs = outerBundleArgs;

        return async (
          routerPrefixRaw: string
        ): Promise<(req: IncomingMessage, res: ServerResponse) => CancelablePromise<void>> => {
          const realPrefix = routerPrefixRaw + realAssetsPath;
          const realPrefixHash = (() => {
            const res = crypto.createHash('sha256');
            res.update(realPrefix);
            return res.digest('base64url');
          })();

          const assetPathForCSSInPrefix = path.join(buildFolder, realPrefixHash);
          if (args.artifacts === 'rebuild') {
            await fs.promises.mkdir(assetPathForCSSInPrefix);

            for (const asset of Object.values(bundleArgs.assetsByName)) {
              const assetContentType = parseContentType(asset.contentType);
              if (
                assetContentType === undefined ||
                assetContentType.type !== 'text' ||
                assetContentType.subtype !== 'css'
              ) {
                continue;
              }

              const assetName = path.basename(asset.localPath);
              const prefixedPath = path.join(assetPathForCSSInPrefix, assetName);
              await copyWithStringSubstitution(
                asset.localPath,
                prefixedPath,
                ROUTE_PREFIX_IDENTIFIER,
                realPrefix
              );
            }
          }

          const prefixedAssetsBySuffix: Record<
            string,
            BundledAsset & {
              handler: (req: IncomingMessage, resp: ServerResponse) => CancelablePromise<void>;
            }
          > = {};

          for (const [suffix, asset] of Object.entries(bundleArgs.assetsBySuffix)) {
            let localPath = asset.localPath;
            const contentType = parseContentType(asset.contentType);
            if (
              contentType !== undefined &&
              contentType.type === 'text' &&
              contentType.subtype === 'css'
            ) {
              localPath = path.join(assetPathForCSSInPrefix, path.basename(localPath));
            }

            const handler = await staticRouteHandler(args, localPath, {
              contentType: asset.contentType,
              immutable: true,
            });
            prefixedAssetsBySuffix[suffix] = {
              ...asset,
              localPath,
              handler: handler(realPrefix),
            };
          }

          return simpleRouteHandler(async (args): Promise<void> => {
            if (args.req.url === undefined) {
              return finishWithServerError(args, new Error('No URL'));
            }

            const url = args.req.url;
            const suffix = url.substring(realPrefix.length);
            const asset = prefixedAssetsBySuffix[suffix];
            if (asset === undefined) {
              return finishWithServerError(args, new Error(`No asset ${suffix} for ${url}`));
            }

            const cancelable = asset.handler(args.req, args.resp);
            args.state.cancelers.add(cancelable.cancel);
            args.state.finishing = true;
            try {
              await cancelable.promise;
              args.state.done = true;
              args.resolve();
            } catch (e) {
              args.state.done = true;
              args.reject(e);
            }
          })(realPrefix);
        };
      },
      docs: [],
    },
  ];
};
