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
import { Callbacks } from './lib/Callbacks';
import { constructCancelablePromise } from './lib/CancelablePromiseConstructor';
import { createCancelablePromiseFromCallbacks } from './lib/createCancelablePromiseFromCallbacks';
import allRoutes from './routers/router';
import { createFakeCancelable } from './lib/createFakeCancelable';
import {
  CONTENT_TIMEOUT_MESSAGE,
  DECOMPRESS_TIMEOUT_MESSAGE,
  READ_TIMEOUT_MESSAGE,
  WRITE_TIMEOUT_MESSAGE,
} from './routers/lib/errors';
import { RouteWithPrefix, constructOpenapiSchemaRoute } from './routers/openapi/routes/schema';
import { CommandLineArgs } from './CommandLineArgs';
import { PendingRoute } from './routers/lib/route';

/**
 * Prefix used on all routes
 */
const globalPrefix = '/shared';

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
  await new Promise<void>((resolve) => {
    updaterRaw = handleUpdates(resolve);
  });
  if (updaterRaw === undefined) {
    throw new Error('implementation error');
  }
  const updater = updaterRaw as CancelablePromise<void>;

  const requestHandler = handleRequests({
    router,
    host: optionsTyped.host!,
    port: optionsTyped.port!,
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

  process.on('SIGINT', () => {
    console.log(`${colorNow()} ${chalk.whiteBright('SIGINT received, shutting down...')}`);
    updater.cancel();
    requestHandler.cancel();
    Promise.all([updater.promise, requestHandler.promise]).finally(() => {
      console.log(`${colorNow()} ${chalk.whiteBright('shutdown complete')}`);
      process.exit(0);
    });
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
            reject(new Error('canceled'));
            state.done = true;
            return;
          }

          const path = typeof route.path === 'string' ? route.path : await route.path(opts);
          if (state.finishing) {
            reject(new Error('canceled'));
            state.done = true;
            return;
          }

          addRouteToRootRouter(router, prefixes, {
            ...route,
            handler,
            path,
          });
          state.finishing = true;
          resolve();
          state.done = true;
        } catch (e) {
          state.finishing = true;
          reject(e);
          state.done = true;
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
            reject(new Error('canceled'));
            state.done = true;
            return;
          }

          for (const route of realRoutes) {
            const handler = await route.handler(opts);
            if (state.finishing) {
              reject(new Error('canceled'));
              state.done = true;
              return;
            }

            const path = typeof route.path === 'string' ? route.path : await route.path(opts);
            if (state.finishing) {
              reject(new Error('canceled'));
              state.done = true;
              return;
            }

            addRouteToRootRouter(router, prefixes, {
              ...route,
              handler,
              path,
            });
          }
          state.finishing = true;
          resolve();
          state.done = true;
        } catch (e) {
          state.finishing = true;
          reject(e);
          state.done = true;
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
  const openapiRoute = constructOpenapiSchemaRoute(opts, () =>
    flattenRoutes({ ...opts, artifacts: 'reuse', serve: false, docsOnly: true })
  );
  await realizeRouteAndAddToRootRouter([globalPrefix], openapiRoute);

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
        result.push({ prefix: globalPrefix + prefix, route: realRoute });
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
  router,
  host,
  port,
  cert,
  key,
}: {
  router: RootRouter;
  host: string;
  port: number;
  cert: Buffer | undefined;
  key: Buffer | undefined;
}): CancelablePromise<void> {
  const rawHandleRequest = timeRequestMiddleware.bind(
    undefined,
    routerRequestHandler.bind(undefined, router)
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
    server.listen(port, host, () => {
      console.log(
        `${colorNow()} ${chalk.whiteBright(`server listening on http://${host}:${port}`)}`
      );
    });
  } else {
    server = https.createServer({ cert, key }, handleRequest);
    server.listen(port, host, () => {
      console.log(
        `${colorNow()} ${chalk.whiteBright(`server listening on https://${host}:${port}`)}`
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
  router: RootRouter,
  req: http.IncomingMessage,
  res: http.ServerResponse
): CancelablePromise<void> {
  if (req.url === undefined || req.method === undefined) {
    return createFakeCancelable(() => defaultRequestHandler(req, res));
  }

  const route = useRouterToRoute(router, req.method, req.url);
  if (route === null) {
    return createFakeCancelable(() => defaultRequestHandler(req, res));
  }

  return route.handler(req, res);
}

async function defaultRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  res.statusCode = 404;
  res.statusMessage = 'Not Found';
  res.setHeader('Content-Type', 'text/plain');
  res.end(`Not Found; url=${req.url}\n`);
}

main();
