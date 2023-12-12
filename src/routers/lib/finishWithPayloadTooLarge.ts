import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { acceptableEncodingsHeader, finishWithEncodedServerResponse } from './acceptEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes the appropriate response to the given request given that
 * the provided payload, either by inspection or via the content-length
 * header, is too large.
 */
export const finishWithPayloadTooLarge = (args: RouteBodyArgs) => {
  args.resp.statusCode = 413;
  args.resp.statusMessage = 'Payload Too Large';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Accept-Encoding', acceptableEncodingsHeader);
  return finishWithEncodedServerResponse(args, 'identity', Readable.from(Buffer.from('')));
};
