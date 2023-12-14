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
import {
  RootRouter,
  addRouteToRootRouter,
  createEmptyRootRouter,
  useRouterToRoute,
} from './routers/lib/router';
import { Callbacks } from './lib/Callbacks';
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
    .parse();

  const optionsRaw = program.opts();
  const optionsTyped: CommandLineArgs = {
    host: optionsRaw.host,
    port: undefined,
    sslCertfile: optionsRaw.sslCertfile,
    sslKeyfile: optionsRaw.sslKeyfile,
    serve: optionsRaw.serve,
    artifacts: optionsRaw.reuseArtifacts ? 'reuse' : 'rebuild',
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
  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      const realRoutes = typeof route === 'function' ? await route() : [route];
      for (const realRoute of realRoutes) {
        addRouteToRootRouter(router, [globalPrefix, prefix], {
          ...realRoute,
          handler: await realRoute.handler(opts),
          path: typeof realRoute.path === 'string' ? realRoute.path : await realRoute.path(opts),
        });
      }
    }
  }
  const openapiRoute = constructOpenapiSchemaRoute(opts, flattenRoutes);
  addRouteToRootRouter(router, [globalPrefix], {
    ...openapiRoute,
    handler: await openapiRoute.handler(opts),
    path: typeof openapiRoute.path === 'string' ? openapiRoute.path : await openapiRoute.path(opts),
  });
  return router;
}

async function flattenRoutes(): Promise<RouteWithPrefix[]> {
  const result: RouteWithPrefix[] = [];
  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      const realRoutes = typeof route === 'function' ? await route() : [route];
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
