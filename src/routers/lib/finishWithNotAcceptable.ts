import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { acceptableEncodingsHeader, finishWithEncodedServerResponse } from './acceptEncoding';
import { AcceptMediaRangeWithoutWeight } from './accept';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes a 406 Not Acceptable response to indicate that the server
 * cannot generate any representation that would be acceptable to
 * the client as indicated by the Accept header.
 *
 * To assist the client, we return the Accept header indicating what
 * media ranges we can generate.
 */
export const finishWithNotAcceptable = (
  args: RouteBodyArgs,
  acceptable: AcceptMediaRangeWithoutWeight[]
) => {
  args.resp.statusCode = 406;
  args.resp.statusMessage = 'Not Acceptable';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader(
    'Accept',
    acceptable
      .map((range) => {
        let str = `${range.type}/${range.subtype}`;
        for (const [key, value] of Object.entries(range.parameters)) {
          str += `; ${key}=${value}`;
        }
        return str;
      })
      .join(', ')
  );
  return finishWithEncodedServerResponse(args, 'identity', Readable.from(Buffer.from('')));
};
