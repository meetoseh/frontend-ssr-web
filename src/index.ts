import { Command } from 'commander';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as readline from 'readline';
import chalk from 'chalk';
import { colorHttpMethod, colorHttpStatus, colorNow } from './logging';
import { CancelablePromise } from './lib/CancelablePromise';
import { handleUpdates } from './updater';
import * as slack from './slack';
import * as os from 'os';
import path from 'path';
import {
  RootRouter,
  addRouteToRootRouter,
  createEmptyRootRouter,
  useRouterToRoute,
} from './routers/lib/router';
import { Callbacks } from './uikit/lib/Callbacks';
import { constructCancelablePromise } from './lib/CancelablePromiseConstructor';
import { createCancelablePromiseFromCallbacks } from './lib/createCancelablePromiseFromCallbacks';
import allRoutes from './routers/router';
import {
  CONTENT_TIMEOUT_MESSAGE,
  DECOMPRESS_TIMEOUT_MESSAGE,
  READ_TIMEOUT_MESSAGE,
  WRITE_TIMEOUT_MESSAGE,
} from './routers/lib/errors';
import { RouteWithPrefix, constructOpenapiSchemaRoute } from './routers/openapi/routes/schema';
import { CommandLineArgs } from './CommandLineArgs';
import { PendingRoute } from './routers/lib/route';
import { inspect } from 'util';
import { createCancelableTimeout } from './lib/createCancelableTimeout';
import { constructSitemapRoute } from './routers/sitemap/routes/sitemap';

/**
 * Prefix used on all routes
 */
const globalPrefix = '/shared' as const;

async function main() {
  const program = new Command();
  program.version('0.0.1');
  program
    .option('-H, --host <hostname>', 'The host to bind to, e.g, 192.168.1.23')
    .option('-p, --port <port>', 'The port to bind to, e.g, 2999')
    .option(
      '-c, --ssl-certfile <path>',
      'The SSL certificate file to use; if not specified, SSL will not be used'
    )
    .option(
      '-k, --ssl-keyfile <path>',
      'The SSL key file to use; if not specified, SSL will not be used'
    )
    .option(
      '--reuse-artifacts',
      'If specified then it is assumed that all build/ artifacts ' +
        'are already available, as if via previously running without this flag. ' +
        'If not specified, then all build/ and tmp/ artifacts will be deleted ' +
        'and regenerated. Note that tmp/ artifacts are generated if missing, ' +
        'regardless of this flag, but missing build/ artifacts will cause an error ' +
        'if this flag is set.'
    )
    .option(
      '--no-serve',
      'If specified, after building artifacts, this exits rather than serving routes. ' +
        'The generated artifacts will be within build/ and tmp/. Artifacts within ' +
        'build/ are typically slower to generate than download, whereas those within tmp/ are ' +
        'typically faster to generate than download'
    )
    .option(
      '--build-parallelism <number>',
      'The maximum number of routes to build simultaneously. This is ignored if reusing artifacts. Defaults to 1.',
      '1'
    )
    .option(
      '--path-resolve-parallelism <number>',
      'The maximum number of templated paths to resolve simultaneously per request. Ignored unless serving.',
      '10'
    )
    .option('--color, --no-color', 'Whether to use color in the console. Defaults to auto-detect')
    .parse();

  const optionsRaw = program.opts();
  console.log(
    `${colorNow()} ${chalk.whiteBright('starting...')}\n${chalk.gray(
      JSON.stringify(optionsRaw, null, 2)
    )}`
  );
  const optionsTyped: CommandLineArgs = {
    host: optionsRaw.host,
    port: undefined,
    sslCertfile: optionsRaw.sslCertfile,
    sslKeyfile: optionsRaw.sslKeyfile,
    serve: optionsRaw.serve,
    artifacts: optionsRaw.reuseArtifacts ? 'reuse' : 'rebuild',
    buildParallelism: 1,
    pathResolveParallelism: 10,
    docsOnly: false,
  };

  let cert: Buffer | undefined = undefined;
  let key: Buffer | undefined = undefined;

  if (optionsTyped.serve) {
    if (optionsTyped.host === undefined) {
      console.error('--host is required');
      process.exit(1);
    }

    if (optionsRaw.port === undefined) {
      console.error('--port is required');
      process.exit(1);
    }

    try {
      optionsTyped.port = parseInt(optionsRaw.port);
    } catch (e) {
      console.error('--port must be a number');
      process.exit(1);
    }

    if ((optionsTyped.sslCertfile === undefined) !== (optionsTyped.sslKeyfile === undefined)) {
      console.error('--ssl-certfile and --ssl-keyfile must be specified together');
      process.exit(1);
    }

    if (optionsTyped.sslCertfile !== undefined && optionsTyped.sslKeyfile !== undefined) {
      [cert, key] = await Promise.all([
        fs.promises.readFile(optionsTyped.sslCertfile),
        fs.promises.readFile(optionsTyped.sslKeyfile),
      ]);
    }

    try {
      optionsTyped.pathResolveParallelism = parseInt(optionsRaw.pathResolveParallelism);
    } catch (e) {
      console.error('--path-resolve-parallelism must be a number');
      process.exit(1);
    }
  }

  if (optionsTyped.artifacts === 'rebuild') {
    try {
      optionsTyped.buildParallelism = parseInt(optionsRaw.buildParallelism);
    } catch (e) {
      console.error('--build-parallelism must be a number');
      process.exit(1);
    }

    try {
      await fs.promises.rm(path.resolve(path.join('build', 'routes')), { recursive: true });
    } catch (e) {}
    try {
      await fs.promises.rm(path.resolve(path.join('tmp')), { recursive: true });
    } catch (e) {}
  }

  const router = await createRouter(optionsTyped);
  if (!optionsTyped.serve) {
    return;
  }

  let updaterRaw: CancelablePromise<void> | undefined = undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      updaterRaw = handleUpdates(resolve, () => reject(new Error('canceled')));
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'canceled') {
      console.log(
        `${colorNow()} ${chalk.whiteBright('updater requested no-serve; aborting serve')}`
      );
      return;
    }
    throw e;
  }

  if (updaterRaw === undefined) {
    throw new Error('implementation error');
  }
  const updater = updaterRaw as CancelablePromise<void>;

  const requestHandler = handleRequests({
    args: optionsTyped as CommandLineArgs & { host: string; port: string },
    router,
    cert,
    key,
  });

  if (process.platform === 'win32') {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', function () {
      process.emit('SIGINT');
    });
  }

  let shuttingDown = false;
  const cancelers = new Callbacks<undefined>();
  const pendingBeforeClose: Record<string, Promise<void>> = {};

  process.on('SIGINT', () => {
    if (shuttingDown) {
      console.log(`${colorNow()} ${chalk.whiteBright('SIGINT ignored, already shutting down')}`);
      return;
    }
    shuttingDown = true;
    console.log(`${colorNow()} ${chalk.whiteBright('SIGINT received, shutting down...')}`);
    updater.cancel();
    requestHandler.cancel();
    Promise.all([updater.promise, requestHandler.promise]).finally(async () => {
      console.log(`${colorNow()} ${chalk.whiteBright('server and updater shutdown complete')}`);
      console.log(`${colorNow()} ${chalk.gray('invoking shutdown cancelers...')}`);
      cancelers.call(undefined);

      const pending = Object.values(pendingBeforeClose);
      if (pending.length > 0) {
        console.log(`${colorNow()} ${chalk.white('waiting for pendingBeforeClose...')}`);
        const timeout = createCancelableTimeout(2000);
        timeout.promise.catch(() => {});
        pending.forEach((p) => {
          p.catch((e) => {
            console.log(
              `${colorNow()} ${chalk.redBright('pendingBeforeClose error')}\n${chalk.gray(
                inspect(e)
              )}`
            );
          });
        });
        try {
          await Promise.race([timeout.promise, Promise.allSettled(pending)]);
          if (!timeout.done()) {
            // check for errors
            await Promise.race([timeout.promise, Promise.all(pending)]);
          }
        } catch (e) {
          console.log(
            `${colorNow()} ${chalk.redBright('shutdown pendingBeforeClose error')}\n${chalk.gray(
              inspect(e)
            )}`
          );
        } finally {
          if (timeout.done()) {
            console.log(`${colorNow()} ${chalk.redBright('shutdown pendingBeforeClose timeout')}`);
          } else {
            console.log(`${colorNow()} ${chalk.whiteBright('shutdown complete')}`);
          }
          process.exit(0);
        }
      } else {
        console.log(
          `${colorNow()} ${chalk.whiteBright('shutdown complete (no pendingBeforeClose)')}`
        );
        process.exit(0);
      }
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    if (shuttingDown) {
      return;
    }

    console.log(
      `${colorNow()} ${chalk.redBright('Unhandled Rejection at: Promise')} ${chalk.whiteBright(
        inspect(promise)
      )}\n${chalk.gray(inspect(reason))}`
    );

    const myId = 'k' + Math.random().toString(36).slice(2);
    const canceled = createCancelablePromiseFromCallbacks(cancelers);
    canceled.promise.catch(() => {});

    if (shuttingDown) {
      canceled.cancel();
      return;
    }
    pendingBeforeClose[myId] = (async () => {
      const slackMessage = slack.sendMessageToCancelable(
        'web-errors',
        `${os.hostname()} unhandled promise in frontend-ssr-web\n\`\`\`\n${inspect(reason)}\n\`\`\``
      );

      try {
        await Promise.race([canceled.promise, slackMessage.promise]);
      } catch (e) {
        console.log(
          `${colorNow()} ${chalk.redBright('error reporting unhandledRejection')}\n${chalk.gray(
            inspect(e)
          )}`
        );
      } finally {
        delete pendingBeforeClose[myId];
        canceled.cancel();
        slackMessage.cancel();
      }
    })();
  });

  if (process.env['ENVIRONMENT'] !== 'dev') {
    slack.sendMessageTo('ops', `frontend-ssr-web ${os.hostname()} ready`);
  }
}

async function createRouter(opts: CommandLineArgs): Promise<RootRouter> {
  try {
    fs.mkdirSync('tmp');
  } catch (e) {}

  const router = createEmptyRootRouter('');

  let pending: CancelablePromise<void>[] = [];
  let pendingLocked = false;
  const pendingLockedCallbacks = new Callbacks<undefined>();

  /**
   * Assumes we have the lock and removes the finished promises
   * from pending. This is a little subtle due to when the compiler
   * can switch contexts
   */
  const sweepPending = async () => {
    const newPending = [];
    for (const p of pending) {
      if (p.done()) {
        await p.promise;
      } else {
        newPending.push(p);
      }
    }
    pending = newPending;
  };

  /**
   * Assumes that we have the lock and sweeps pending until it has
   * strictly less than the given number of promises
   */
  const sweepUntilLessThan = async (max: number) => {
    await sweepPending();
    while (pending.length >= max) {
      await Promise.race(pending.map((p) => p.promise));
      const prevLength = pending.length;
      await sweepPending();
      const newLength = pending.length;
      if (newLength >= prevLength) {
        throw new Error('implementation error (not making progress)');
      }
    }
  };

  /**
   * Waits until some progress is made on pendingLocked. It is
   * not guarranteed that pendingLocked is false when this resolves
   */
  const waitForLockMaybeFree = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!pendingLocked) {
        resolve();
        return;
      }

      const onResolve = () => {
        pendingLockedCallbacks.remove(onResolve);
        resolve();
      };
      pendingLockedCallbacks.add(onResolve);
    });
  };

  /**
   * Returns once the necessary promise is in pending, not when the
   * route is actually added.
   */
  const realizeRouteAndAddToRootRouter = async (
    prefixes: string[],
    route: PendingRoute
  ): Promise<void> => {
    while (pending.length >= opts.buildParallelism || pendingLocked) {
      if (pendingLocked) {
        await waitForLockMaybeFree();
        continue;
      }

      pendingLocked = true;
      await sweepUntilLessThan(opts.buildParallelism);
      pendingLocked = false;
      pendingLockedCallbacks.call(undefined);
    }

    pendingLocked = true;
    const newPromise = constructCancelablePromise<void>({
      body: async (state, resolve, reject) => {
        try {
          const handler = await route.handler(opts);
          if (state.finishing) {
            state.done = true;
            reject(new Error('canceled'));
            return;
          }

          const path = typeof route.path === 'string' ? route.path : await route.path(opts);
          if (state.finishing) {
            state.done = true;
            reject(new Error('canceled'));
            return;
          }

          await addRouteToRootRouter(router, prefixes, {
            ...route,
            handler,
            path,
          });
          state.finishing = true;
          state.done = true;
          resolve();
        } catch (e) {
          state.finishing = true;
          state.done = true;
          reject(e);
        }
      },
    });
    pending.push(newPromise);
    pendingLocked = false;
    pendingLockedCallbacks.call(undefined);
  };

  /**
   * Initializes a dynamic list of routes using a single slot in pending by
   * sequentially initializing each route in the list. Note that it would not be
   * safe to try to "bounce" this to pending, since that would lead to a
   * deadlock. However, in practice, whenever a route is specified in this way,
   * all the routes are highly related, e.g., bundle the route, then construct
   * the assets. That operation is necessarily sequential anyway, so it makes
   * more sense to leave the other pending slots for other routes that can
   * actually make use of the parallelism.
   */
  const initRoutesThenRealizeEachThenAddToRootRouter = async (
    prefixes: string[],
    routes: (args: CommandLineArgs) => Promise<PendingRoute[]>
  ): Promise<void> => {
    while (pending.length >= opts.buildParallelism || pendingLocked) {
      if (pendingLocked) {
        await waitForLockMaybeFree();
        continue;
      }

      pendingLocked = true;
      await sweepUntilLessThan(opts.buildParallelism);
      pendingLocked = false;
      pendingLockedCallbacks.call(undefined);
    }

    pendingLocked = true;
    const newPromise = constructCancelablePromise<void>({
      body: async (state, resolve, reject) => {
        try {
          const realRoutes = await routes(opts);
          if (state.finishing) {
            state.done = true;
            reject(new Error('canceled'));
            return;
          }

          for (const route of realRoutes) {
            const handler = await route.handler(opts);
            if (state.finishing) {
              state.done = true;
              reject(new Error('canceled'));
              return;
            }

            const path = typeof route.path === 'string' ? route.path : await route.path(opts);
            if (state.finishing) {
              state.done = true;
              reject(new Error('canceled'));
              return;
            }

            await addRouteToRootRouter(router, prefixes, {
              ...route,
              handler,
              path,
            });
          }
          state.finishing = true;
          state.done = true;
          resolve();
        } catch (e) {
          state.finishing = true;
          state.done = true;
          reject(e);
        }
      },
    });
    pending.push(newPromise);
    pendingLocked = false;
    pendingLockedCallbacks.call(undefined);
  };

  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      // awaits here are optional and do not affect the parallelism factor
      if (typeof route === 'function') {
        await initRoutesThenRealizeEachThenAddToRootRouter([globalPrefix, prefix], route);
      } else {
        await realizeRouteAndAddToRootRouter([globalPrefix, prefix], route);
      }
    }
  }
  const getFlatRoutes = () =>
    flattenRoutes({ ...opts, artifacts: 'reuse', serve: false, docsOnly: true });

  const openapiRoute = constructOpenapiSchemaRoute(getFlatRoutes);
  await realizeRouteAndAddToRootRouter([globalPrefix], openapiRoute);
  const sitemapRoutes = constructSitemapRoute(getFlatRoutes);
  for (const sitemapRoute of sitemapRoutes) {
    await realizeRouteAndAddToRootRouter([], sitemapRoute);
  }

  while (pending.length > 0 || pendingLocked) {
    if (pendingLocked) {
      await waitForLockMaybeFree();
      continue;
    }

    await sweepUntilLessThan(1);
  }
  return router;
}

async function flattenRoutes(opts: CommandLineArgs): Promise<RouteWithPrefix[]> {
  const result: RouteWithPrefix[] = [];
  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      const realRoutes = typeof route === 'function' ? await route(opts) : [route];
      for (const realRoute of realRoutes) {
        result.push({ prefix: (globalPrefix + prefix) as `/${string}`, route: realRoute });
      }
    }
  }
  return result;
}

/**
 * Initializes the http or https server as appropriate given the provided
 * options, and begins listening for requests. Returns the initialized server.
 */
function handleRequests({
  args,
  router,
  cert,
  key,
}: {
  args: CommandLineArgs & { host: string; port: string };
  router: RootRouter;
  cert: Buffer | undefined;
  key: Buffer | undefined;
}): CancelablePromise<void> {
  const rawHandleRequest = timeRequestMiddleware.bind(
    undefined,
    routerRequestHandler.bind(undefined, args, router)
  );
  const runningRequests: Record<number, CancelablePromise<void>> = {};
  let requestCounter = 0;

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const request = rawHandleRequest(req, res);
    const requestId = requestCounter;
    requestCounter++;
    runningRequests[requestId] = request;
    request.promise
      .catch((e) => {
        console.log(`${colorNow()} ${chalk.redBright('Eating top-level request error: ')}`, e);
      })
      .finally(() => {
        delete runningRequests[requestId];
      });
  };

  let server: http.Server | https.Server;
  if (cert === undefined || key === undefined) {
    server = http.createServer(handleRequest);
    server.listen(args.port, args.host, () => {
      console.log(
        `${colorNow()} ${chalk.whiteBright(`server listening on http://${args.host}:${args.port}`)}`
      );
    });
  } else {
    server = https.createServer({ cert, key }, handleRequest);
    server.listen(args.port, args.host, () => {
      console.log(
        `${colorNow()} ${chalk.whiteBright(
          `server listening on https://${args.host}:${args.port}`
        )}`
      );
    });
  }

  let done = false;
  let tentativelyDone = false;
  let resolve: (() => void) | undefined = undefined;

  const promise = new Promise<void>((r) => {
    resolve = r;
    if (done) {
      resolve();
    }
  });

  return {
    done: () => done,
    cancel: () => {
      if (tentativelyDone) {
        return;
      }
      tentativelyDone = true;
      server.close(() => {
        if (!done) {
          done = true;
          console.log(`${colorNow()} ${chalk.gray('listening socket closed')}`);
          resolve?.();
        }
      });

      for (const running of Object.values(runningRequests)) {
        running.cancel();
      }
    },
    promise,
  };
}

const knownSuppressableErrorMessages = {
  [WRITE_TIMEOUT_MESSAGE]: 'WRITE TIMEOUT',
  [READ_TIMEOUT_MESSAGE]: 'READ TIMEOUT',
  [CONTENT_TIMEOUT_MESSAGE]: 'CONTENT TIMEOUT',
  [DECOMPRESS_TIMEOUT_MESSAGE]: 'DECOMPRESS TIMEOUT',
};

function timeRequestMiddleware(
  next: (req: http.IncomingMessage, res: http.ServerResponse) => CancelablePromise<void>,
  req: http.IncomingMessage,
  res: http.ServerResponse
): CancelablePromise<void> {
  let done = false;
  let tentativelyDone = false;
  const cancelers = new Callbacks<undefined>();

  return {
    done: () => done,
    cancel: () => {
      if (!tentativelyDone) {
        tentativelyDone = true;
        cancelers.call(undefined);
      }
    },
    promise: new Promise<void>(async (resolve, reject) => {
      if (tentativelyDone) {
        reject(new Error('canceled'));
        return;
      }

      const canceled = createCancelablePromiseFromCallbacks(cancelers);

      const requestStartedAt = performance.now();
      const handler = next(req, res);
      try {
        await Promise.race([canceled.promise, handler.promise]);
      } catch (e) {
        canceled.cancel();
        handler.cancel();

        if (!tentativelyDone) {
          if (e instanceof Error && e.message in knownSuppressableErrorMessages) {
            const knownMessage =
              knownSuppressableErrorMessages[
                e.message as keyof typeof knownSuppressableErrorMessages
              ];
            console.info(
              `${colorNow()} ${colorHttpMethod(req.method)} ${chalk.white(
                `${req.url} -> ${chalk.redBright(knownMessage)}`
              )}`
            );
            tentativelyDone = true;
            resolve();
            return;
          }

          console.warn(
            `${colorNow()} ${colorHttpMethod(req.method)} ${chalk.white(
              `${req.url} -> ${chalk.redBright('ERROR')}`
            )}`,
            e
          );
          tentativelyDone = true;
          reject(e);
          return;
        }
      }

      if (tentativelyDone) {
        console.warn(
          `${colorNow()} ${colorHttpMethod(req.method)} ${chalk.white(
            `${req.url} -> ${chalk.redBright('CANCELED')}`
          )}`
        );
        handler.cancel();
        reject(new Error('canceled'));
        return;
      }

      canceled.cancel();
      const requestFinishedAt = performance.now();

      console.info(
        `${colorNow()} ${colorHttpMethod(req.method)} ${chalk.white(
          `${req.url} -> `
        )}${colorHttpStatus(res.statusCode, res.statusMessage)}${chalk.white(
          ` in ${(requestFinishedAt - requestStartedAt).toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })}ms`
        )}`
      );
      resolve();
    }).finally(() => {
      done = true;
    }),
  };
}

function routerRequestHandler(
  args: CommandLineArgs,
  router: RootRouter,
  req: http.IncomingMessage,
  res: http.ServerResponse
): CancelablePromise<void> {
  return constructCancelablePromise<void>({
    body: async (state, resolve, reject) => {
      const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
      if (state.finishing) {
        if (!state.done) {
          state.done = true;
          reject(new Error('canceled'));
        }
        return;
      }

      if (req.url === undefined || req.method === undefined) {
        state.finishing = true;
        await defaultRequestHandler(req, res);
        state.done = true;
        resolve();
        return;
      }

      const routeCancelable = useRouterToRoute(args, router, req.method, req.url);
      state.cancelers.add(routeCancelable.cancel);
      try {
        await Promise.race([routeCancelable.promise, canceled.promise]);
      } catch (e) {}

      if (state.finishing) {
        if (!state.done) {
          state.done = true;
          reject(new Error('canceled'));
        }
        return;
      }

      state.cancelers.remove(routeCancelable.cancel);
      const route = await routeCancelable.promise;
      if (route === null) {
        state.finishing = true;
        await defaultRequestHandler(req, res);
        state.done = true;
        resolve();
        return;
      }

      const routeHandler = route.handler(req, res);
      state.cancelers.add(routeHandler.cancel);
      if (state.finishing) {
        routeHandler.cancel();
      }

      try {
        await routeHandler.promise;
        state.finishing = true;
        state.done = true;
        resolve();
      } catch (e) {
        state.finishing = true;
        state.done = true;
        reject(e);
      }
    },
  });
}

async function defaultRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  res.statusCode = 404;
  res.statusMessage = 'Not Found';
  res.setHeader('Content-Type', 'text/plain');
  res.end(`Not Found; url=${req.url}\n`);
}

main();
