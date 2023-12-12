import { IncomingMessage, ServerResponse } from 'http';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { simpleRouteHandler } from './simpleRouteHandler';
import {
  AcceptableEncoding,
  acceptableEncodings,
  finishWithEncodedServerResponse,
  parseAcceptEncoding,
  selectEncoding,
  supportedEncodings,
} from './acceptEncoding';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { finishWithBadEncoding } from './finishWithBadEncoding';
import { finishWithServiceUnavailable } from './finishWithServiceUnavailable';
import { STANDARD_VARY_RESPONSE } from './constants';
import { AcceptMediaRangeWithoutWeight, parseAccept, selectAccept } from './accept';
import { parseContentType } from './contentType';
import { finishWithBadRequest } from './finishWithBadRequest';
import { finishWithNotAcceptable } from './finishWithNotAcceptable';
import { BAD_REQUEST_MESSAGE } from './errors';

/**
 * A static route handler, which just serves the contents of the file at the
 * given location. The file is compressed eagerly, so that when it is served
 * it is a simple matter of piping the compressed file to the response.
 *
 * @param filepath The path to the file to serve.
 * @param options.contentType The content type to serve the file as.
 */
export const staticRouteHandler = async (
  filepath: string,
  options: {
    contentType: string;
  }
): Promise<
  (routerPrefix: string) => (req: IncomingMessage, resp: ServerResponse) => CancelablePromise<void>
> => {
  const parsedContentType = parseContentType(options.contentType);
  if (parsedContentType === undefined) {
    throw new Error('invalid content type');
  }

  const hasher = crypto.createHash('sha512');
  hasher.update(filepath, 'utf-8');
  const cacheKey = hasher.digest('base64url');

  await Promise.all(
    acceptableEncodings.map((encoding) =>
      compress(filepath, `tmp/${cacheKey}.${encoding}`, encoding)
    )
  );
  const acceptable: AcceptMediaRangeWithoutWeight[] = [parsedContentType];

  if ('charset' in parsedContentType.parameters) {
    const charset = parsedContentType.parameters.charset;
    if (charset === 'utf8') {
      acceptable.push({
        ...parsedContentType,
        parameters: { ...parsedContentType.parameters, charset: 'utf-8' },
      });
    } else if (charset === 'utf-8') {
      acceptable.push({
        ...parsedContentType,
        parameters: { ...parsedContentType.parameters, charset: 'utf8' },
      });
    }
  }

  return simpleRouteHandler(async (args) => {
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

    const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
    if (coding === null) {
      return finishWithBadEncoding(args);
    }
    let responseStream;
    try {
      responseStream = fs.createReadStream(`tmp/${cacheKey}.${coding}`, {
        autoClose: true,
      });
    } catch (e) {
      return finishWithServiceUnavailable(args, { retryAfterSeconds: 60 });
    }

    args.resp.statusCode = 200;
    args.resp.statusMessage = 'OK';
    args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
    args.resp.setHeader('Content-Encoding', coding);
    args.resp.setHeader('Content-Type', options.contentType);
    args.resp.setHeader(
      'Cache-Control',
      'public, max-age=2, stale-while-revalidate=10, stale-if-error=86400'
    );
    return finishWithEncodedServerResponse(args, 'identity', responseStream);
  });
};

/**
 * Compresses the given file to the given location using the given encoding.
 *
 * @param inpath The path to the file to compress.
 * @param outpath The path to the file to write the compressed file to.
 * @param encoding The encoding to use.
 */
const compress = async (inpath: string, outpath: string, encoding: AcceptableEncoding) => {
  try {
    fs.unlinkSync(outpath);
  } catch (e) {}

  const inStream = fs.createReadStream(inpath, {
    autoClose: true,
  });
  const adaptedStream = supportedEncodings[encoding](inStream);

  await fs.promises.writeFile(outpath + '.tmp', adaptedStream);
  fs.renameSync(outpath + '.tmp', outpath);
};
