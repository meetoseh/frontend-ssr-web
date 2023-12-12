import { Command } from "commander";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as readline from "readline";
import chalk from "chalk";
import { colorHttpMethod, colorHttpStatus, colorNow } from "./logging";
import { CancelablePromise } from "./lib/CancelablePromise";
import { handleUpdates } from "./updater";
import * as slack from "./slack";
import * as os from "os";
import {
  RootRouter,
  addRouteToRootRouter,
  createEmptyRootRouter,
  useRouterToRoute,
} from "./routers/lib/router";
import { Callbacks } from "./lib/Callbacks";
import { createCancelablePromiseFromCallbacks } from "./lib/createCancelablePromiseFromCallbacks";
import allRoutes from "./routers/router";
import { createFakeCancelable } from "./lib/createFakeCancelable";
import {
  CONTENT_TIMEOUT_MESSAGE,
  DECOMPRESS_TIMEOUT_MESSAGE,
  READ_TIMEOUT_MESSAGE,
  WRITE_TIMEOUT_MESSAGE,
} from "./routers/lib/errors";
import {
  RouteWithPrefix,
  constructOpenapiSchemaRoute,
  regenerateSchema,
} from "./routers/openapi/routes/schema";

/**
 * Prefix used on all routes
 */
const globalPrefix = "/shared";

async function main() {
  const program = new Command();
  program.version("0.0.1");
  program
    .option(
      "--regenerate-schema",
      "Regenerate the OpenAPI schema and exit, ignoring other parameters. Does not usually " +
        "need to be run manually as we will invoke it automatically when needed.",
      false
    )
    .option("-H, --host <hostname>", "The host to bind to, e.g, 192.168.1.23")
    .option("-p, --port <port>", "The port to bind to, e.g, 2999")
    .option(
      "-c, --ssl-certfile <path>",
      "The SSL certificate file to use; if not specified, SSL will not be used"
    )
    .option(
      "-k, --ssl-keyfile <path>",
      "The SSL key file to use; if not specified, SSL will not be used"
    )
    .parse();

  const options = program.opts();

  if (options.regenerateSchema) {
    regenerateSchema(flattenRoutes(), {
      title: "Oseh Frontend SSR Web",
      version: "1.0.0",
    });
    return;
  }

  if (options.host === undefined) {
    console.error("--host is required");
    process.exit(1);
  }

  if (options.port === undefined) {
    console.error("--port is required");
    process.exit(1);
  }

  let portNumber: number | undefined = undefined;
  try {
    portNumber = parseInt(options.port);
  } catch (e) {
    console.error("--port must be a number");
    process.exit(1);
  }

  const sslCertfilePath: string | undefined = options.sslCertfile;
  const sslKeyfilePath: string | undefined = options.sslKeyfile;

  if ((sslCertfilePath === undefined) !== (sslKeyfilePath === undefined)) {
    console.error(
      "--ssl-certfile and --ssl-keyfile must be specified together"
    );
    process.exit(1);
  }

  let cert: Buffer | undefined = undefined;
  let key: Buffer | undefined = undefined;

  if (sslCertfilePath !== undefined && sslKeyfilePath !== undefined) {
    [cert, key] = await Promise.all([
      fs.promises.readFile(sslCertfilePath),
      fs.promises.readFile(sslKeyfilePath),
    ]);
  }

  const router = await createRouter();

  let updaterRaw: CancelablePromise<void> | undefined = undefined;
  await new Promise<void>((resolve) => {
    updaterRaw = handleUpdates(resolve);
  });
  if (updaterRaw === undefined) {
    throw new Error("implementation error");
  }
  const updater = updaterRaw as CancelablePromise<void>;

  const requestHandler = handleRequests({
    router,
    host: options.host,
    port: portNumber,
    cert,
    key,
  });

  if (process.platform === "win32") {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("SIGINT", function () {
      process.emit("SIGINT");
    });
  }

  process.on("SIGINT", () => {
    console.log(
      `${colorNow()} ${chalk.whiteBright("SIGINT received, shutting down...")}`
    );
    updater.cancel();
    requestHandler.cancel();
    Promise.all([updater.promise, requestHandler.promise]).finally(() => {
      console.log(`${colorNow()} ${chalk.whiteBright("shutdown complete")}`);
      process.exit(0);
    });
  });

  if (process.env["ENVIRONMENT"] !== "dev") {
    slack.sendMessageTo("ops", `frontend-ssr-web ${os.hostname()} ready`);
  }
}

async function createRouter(): Promise<RootRouter> {
  try {
    fs.mkdirSync("tmp");
  } catch (e) {}

  const router = createEmptyRootRouter("");
  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      addRouteToRootRouter(router, [globalPrefix, prefix], {
        ...route,
        handler: await route.handler(),
      });
    }
  }
  addRouteToRootRouter(router, [globalPrefix], constructOpenapiSchemaRoute());
  return router;
}

function flattenRoutes(): RouteWithPrefix[] {
  const result: RouteWithPrefix[] = [];
  for (const [prefix, routes] of Object.entries(allRoutes)) {
    for (const route of routes) {
      result.push({ prefix: globalPrefix + prefix, route });
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

  const handleRequest = (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    const request = rawHandleRequest(req, res);
    const requestId = requestCounter;
    requestCounter++;
    runningRequests[requestId] = request;
    request.promise
      .catch((e) => {
        console.log(
          `${colorNow()} ${chalk.redBright(
            "Eating top-level request error: "
          )}`,
          e
        );
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
        `${colorNow()} ${chalk.whiteBright(
          `server listening on http://${host}:${port}`
        )}`
      );
    });
  } else {
    server = https.createServer({ cert, key }, handleRequest);
    server.listen(port, host, () => {
      console.log(
        `${colorNow()} ${chalk.whiteBright(
          `server listening on https://${host}:${port}`
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
          console.log(`${colorNow()} ${chalk.gray("listening socket closed")}`);
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
  [WRITE_TIMEOUT_MESSAGE]: "WRITE TIMEOUT",
  [READ_TIMEOUT_MESSAGE]: "READ TIMEOUT",
  [CONTENT_TIMEOUT_MESSAGE]: "CONTENT TIMEOUT",
  [DECOMPRESS_TIMEOUT_MESSAGE]: "DECOMPRESS TIMEOUT",
};

function timeRequestMiddleware(
  next: (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => CancelablePromise<void>,
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
        reject(new Error("canceled"));
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
          if (
            e instanceof Error &&
            e.message in knownSuppressableErrorMessages
          ) {
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
              `${req.url} -> ${chalk.redBright("ERROR")}`
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
            `${req.url} -> ${chalk.redBright("CANCELED")}`
          )}`
        );
        handler.cancel();
        reject(new Error("canceled"));
        return;
      }

      canceled.cancel();
      const requestFinishedAt = performance.now();

      console.info(
        `${colorNow()} ${colorHttpMethod(req.method)} ${chalk.white(
          `${req.url} -> `
        )}${colorHttpStatus(res.statusCode, res.statusMessage)}${chalk.white(
          ` in ${(requestFinishedAt - requestStartedAt).toLocaleString(
            undefined,
            {
              maximumFractionDigits: 3,
            }
          )}ms`
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

async function defaultRequestHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  res.statusCode = 404;
  res.statusMessage = "Not Found";
  res.setHeader("Content-Type", "text/plain");
  res.end(`Not Found; url=${req.url}\n`);
}

main();
