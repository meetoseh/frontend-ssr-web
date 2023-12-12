import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { acceptableEncodingsHeader, finishWithEncodedServerResponse } from './acceptEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes the appropriate response to the given request given that
 * the accept-encoding header indicated no acceptable supported encodings,
 * or that the given content-encoding was not supported.
 */
export const finishWithBadEncoding = (args: RouteBodyArgs) => {
  // status code is explicitly defined in RFC 9110
  // https://www.rfc-editor.org/rfc/rfc9110.html#name-accept-encoding
  // https://www.rfc-editor.org/rfc/rfc9110#status.415
  args.resp.statusCode = 415;
  args.resp.statusMessage = 'Unsupported Media Type';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Accept-Encoding', acceptableEncodingsHeader);
  return finishWithEncodedServerResponse(args, 'identity', Readable.from(Buffer.from('')));
};
