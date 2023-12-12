import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { acceptableEncodingsHeader, finishWithEncodedServerResponse } from './acceptEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes a generic 500 internal server error response to the given request. This
 * is usually used if there was a low-level socket error, e.g., an error reading
 * the request body. Typically this will lead to the response failing anyway, but
 * this is still useful in that scenario to properly cleanup the request before
 * eventually bubbling up to the top-level error handler.
 *
 * If the response is written successfully, however, the error can be specified
 * to ensure the request body still rejects with the given error. This is particularly
 * important for e.g., content timeouts (a real low-level issue on our end)
 */
export const finishWithServerError = (args: RouteBodyArgs, error?: Error) => {
  args.resp.statusCode = 500;
  args.resp.statusMessage = 'Internal Server Error';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Accept-Encoding', acceptableEncodingsHeader);
  return finishWithEncodedServerResponse(args, 'identity', Readable.from(Buffer.from('')), error);
};
