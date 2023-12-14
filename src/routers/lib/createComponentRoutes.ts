import { ReactElement } from 'react';
import { RouteBodyArgs } from './RouteBodyArgs';
import { PendingRoute, Route } from './route';
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
   * root. For example, `build/routers/example/main.d587bbd6e38337f5accd.css`
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

  /**
   * The handler for serving this asset. This is taken care of by the
   * createComponentRoutes function and thus is not usually useful to
   * the callee
   */
  handler: Route['handler'];
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
      path: (routerPrefix: string) => (url: string) => boolean;
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
  ) => Promise<(routerPrefix: string) => (args: RouteBodyArgs) => Promise<T>>;

  /**
   * The documentation for the route serving the component.
   */
  docs: Omit<OASPathItem, 'responses'>;
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
        const handler = await staticRouteHandler(args, path.join(folder, filename), {
          contentType,
          immutable: true,
        });
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
          handler,
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
      cssPublicPath: realAssetsPath,
    });
    await initBundleArgs();
  }

  return [
    {
      methods: ['GET'],
      path: () => routePath,
      handler: async (args: CommandLineArgs) => {
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
            return async (args) => {
              const props = await realBody(args);
              return {
                element: component(props),
                props,
              };
            };
          },
          (routerPrefix) => ({
            bootstrapModules: bootstrapModules.map((m) => routerPrefix + m),
          })
        );
      },
      docs: [
        {
          templatedRelativePath:
            typeof routePath === 'string' ? routePath : (rest as any).templatedRelativePath,
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
      path: async (): Promise<(routerPrefix: string) => (url: string) => boolean> => {
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

        return (routerPrefixRaw: string) => {
          const realPrefix = routerPrefixRaw + realAssetsPath;
          const prefixedAssetsBySuffix = Object.fromEntries(
            Object.entries(bundleArgs.assetsBySuffix).map(([suffix, asset]) => [
              suffix,
              {
                ...asset,
                handler: asset.handler(realPrefix),
              },
            ])
          );

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
              args.resolve();
            } catch (e) {
              args.reject(e);
            }
          })(realPrefix);
        };
      },
      docs: [],
    },
  ];
};
