import { colorNow } from '../../../logging';
import {
  acceptableEncodings,
  finishWithEncodedServerResponse,
  parseAcceptEncoding,
  selectEncoding,
  supportedEncodings,
} from '../../lib/acceptEncoding';
import { Route } from '../../lib/route';
import * as fs from 'fs';
import chalk from 'chalk';
import { Readable } from 'stream';
import { OpenAPI, OASInfo, OASPaths } from '../../lib/openapi';
import { spawn } from 'child_process';
import { simpleRouteHandler } from '../../lib/simpleRouteHandler';
import { finishWithBadEncoding } from '../../lib/finishWithBadEncoding';
import { finishWithServiceUnavailable } from '../../lib/finishWithServiceUnavailable';
import { STANDARD_VARY_RESPONSE } from '../../lib/constants';
import { AcceptMediaRangeWithoutWeight, parseAccept, selectAccept } from '../../lib/accept';
import { BAD_REQUEST_MESSAGE } from '../../lib/errors';
import { finishWithBadRequest } from '../../lib/finishWithBadRequest';
import { finishWithNotAcceptable } from '../../lib/finishWithNotAcceptable';

const acceptable: AcceptMediaRangeWithoutWeight[] = [
  { type: 'application', subtype: 'json', parameters: { charset: 'utf-8' } },
  { type: 'application', subtype: 'json', parameters: { charset: 'utf8' } },
];

/**
 * Creates a new meta-route based which returns the OpenAPI schema. The returned
 * schema does not include the route returned by this function (and indeed, the
 * returned route has an empty docs array), as this schema document is typically
 * thought of as a static file rather than a dynamic endpoint.
 *
 * The routes are not provided here as an argument since they are not used in this
 * process anyway; the entry file must be able to pass them to `regenerateSchema`
 * when invoked in a separate process.
 *
 * This eagerly caches the result locally in all supported compression methods and
 * uses non-aggressive cache-control settings. To avoid slowing server start speeds,
 * this will be done on a separate process. The route will return 503 until the
 * schema is ready in the requested encoding. An old version of the schema is never
 * returned.
 *
 * If something goes wrong generating the schema in any of the encodings, the
 * returned route will perpetually return 503 for those failed encodings until
 * regenerated, such as by restarting the server.
 */
export const constructOpenapiSchemaRoute = (): Route => {
  deleteSchemaSync();
  spawn(
    'npx ts-node --experimental-specifier-resolution=node --esm build/server/server.bundle.js --regenerate-schema',
    {
      shell: true,
      detached: false,
      env: process.env,
    }
  );

  return {
    methods: ['GET'],
    path: '/openapi.json',
    handler: simpleRouteHandler(async (args) => {
      const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
      if (coding === null) {
        return finishWithBadEncoding(args);
      }

      let accept;
      try {
        accept = selectAccept(parseAccept(args.req.headers['accept']), acceptable);
      } catch (e) {
        if (e instanceof Error && e.message === BAD_REQUEST_MESSAGE) {
          return finishWithBadRequest(args);
        }
        throw e;
      }

      if (accept === undefined) {
        return finishWithNotAcceptable(args, acceptable);
      }

      if (!fs.existsSync(pathToEncoding(coding))) {
        return finishWithServiceUnavailable(args, { retryAfterSeconds: 5 });
      }

      let responseStream;
      try {
        responseStream = fs.createReadStream(pathToEncoding(coding), {
          autoClose: true,
        });
      } catch (e) {
        return finishWithServiceUnavailable(args, { retryAfterSeconds: 5 });
      }

      args.resp.statusCode = 200;
      args.resp.statusMessage = 'OK';
      args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
      args.resp.setHeader('Content-Encoding', coding);
      args.resp.setHeader('Content-Type', 'application/json; charset=utf-8');
      return finishWithEncodedServerResponse(args, 'identity', responseStream);
    }),
    docs: [],
  };
};

const pathToEncoding = (encoding: string) => {
  return `tmp/openapi-schema.json.${encoding}`;
};

const deleteSchemaSync = () => {
  if (!fs.existsSync('tmp')) {
    return;
  }

  for (const encoding of acceptableEncodings) {
    const path = pathToEncoding(encoding);
    try {
      fs.unlinkSync(path);
      console.debug(`${colorNow()} ${chalk.gray(`deleted ${path}`)}`);
    } catch (e) {}
    try {
      fs.unlinkSync(path + '.tmp');
      console.debug(
        `${colorNow()} ${chalk.redBright(
          `deleted ${path}.tmp: this indicates the generation process failed`
        )}`
      );
    } catch (e) {}
  }
};

export type RouteWithPrefix = { prefix: string; route: Pick<Route, 'docs'> };

const combineRoutesToSchema = (routes: RouteWithPrefix[], info: OASInfo): OpenAPI => {
  const paths: OASPaths = {};
  for (const handler of routes) {
    const docsAsArray = Array.isArray(handler.route.docs)
      ? handler.route.docs
      : [handler.route.docs];
    for (const rawItem of docsAsArray) {
      paths[handler.prefix + rawItem.templatedRelativePath] = rawItem.pathItem;
    }
  }

  return {
    openapi: '3.0.3',
    info,
    paths,
    tags: [],
  };
};

/**
 * Entry point for the regenerate openapi schema command, which is invoked
 * in a separate process by constructOpenapiSchemaRoute after deleting
 * the old schema synchronously, ensuring that old versions of the schema
 * are never returned. However, this will also delete the old schema in case it's
 * being invoked manually.
 *
 * This will write all available encodings to disk, writing first to a tmp file
 * and then only once the file is fully written, renaming it to the final name.
 *
 * @param routes The routes that will be used to generate the schema. Each route
 *   can independently choose to add (or not add) multiple different path items
 *   via the docs array, so there's not typically a reason to filter this list
 *   from all of those that are available.
 */
export const regenerateSchema = async (routes: RouteWithPrefix[], info: OASInfo) => {
  deleteSchemaSync();

  console.log(
    `${colorNow()} ${chalk.white('Generating OpenAPI 3.1 schema from')} ${chalk.cyan(
      routes.length.toLocaleString()
    )} ${chalk.white('routes')}`
  );
  const startedAt = performance.now();
  const schemaRaw = combineRoutesToSchema(routes, info);
  const schemaRawGeneratedAt = performance.now();
  console.log(
    `${colorNow()} ${chalk.gray('Generated raw schema in')} ${chalk.gray(
      (schemaRawGeneratedAt - startedAt).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      })
    )}ms`
  );
  const schemaIdentity = JSON.stringify(schemaRaw);
  const identityGeneratedAt = performance.now();
  console.log(
    `${colorNow()} ${chalk.gray('Generated identity-encoded json schema in')} ${chalk.gray(
      (identityGeneratedAt - schemaRawGeneratedAt).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      })
    )}ms`
  );

  if (!fs.existsSync('tmp')) {
    fs.mkdirSync('tmp');
  }

  let lastWrittenAt = identityGeneratedAt;
  for (const encoding of acceptableEncodings) {
    const rawStream = Readable.from(Buffer.from(schemaIdentity, 'utf-8'));
    const adaptedStream = supportedEncodings[encoding](rawStream);
    const finalPath = pathToEncoding(encoding);
    const tmpPath = finalPath + '.tmp';

    await fs.promises.writeFile(tmpPath, adaptedStream, {
      flag: 'w',
      encoding: 'binary',
    });
    fs.renameSync(tmpPath, finalPath);
    const writtenAt = performance.now();
    console.log(
      `${colorNow()} ${chalk.gray(`Wrote ${encoding} schema to ${finalPath}`)} ${chalk.gray(
        (writtenAt - lastWrittenAt).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })
      )}ms`
    );
    lastWrittenAt = writtenAt;
  }

  const finishedAt = performance.now();
  console.log(
    `${colorNow()} ${chalk.gray('Wrote OpenAPI schema in all encodings in ')} ${chalk.gray(
      (finishedAt - startedAt).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      })
    )}ms`
  );
};
