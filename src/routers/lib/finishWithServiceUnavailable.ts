import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { finishWithEncodedServerResponse } from './acceptEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes the appropriate response to the given request given that our server
 * is not ready to process the request.
 */
export const finishWithServiceUnavailable = (
  args: RouteBodyArgs,
  opts: { retryAfterSeconds: number }
) => {
  args.resp.statusCode = 503;
  args.resp.statusMessage = 'Service Unavailable';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Retry-After', opts.retryAfterSeconds.toString());
  return finishWithEncodedServerResponse(args, 'identity', Readable.from(Buffer.from('')));
};
