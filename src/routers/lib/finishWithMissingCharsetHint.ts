import { Readable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import { acceptableEncodingsHeader, finishWithEncodedServerResponse } from './acceptEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';

/**
 * Writes a 400 bad request response to the given request. This should be used
 * if the content-type was understood, but the client didn't indicate a charset.
 * For example, the client sent `Content-Type: application/json` instead of
 * `Content-Type: application/json; charset=utf-8`.
 *
 * In this case many servers would try to sniff the charset, but we don't want
 * to do that since it's both slow and error-prone. Instead, we will reject
 * the request with an explanation of how to fix it.
 */
export const finishWithMissingCharsetHint = (args: RouteBodyArgs) => {
  args.resp.statusCode = 400;
  args.resp.statusMessage = 'Bad Request';
  args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
  args.resp.setHeader('Accept-Encoding', acceptableEncodingsHeader);
  args.resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return finishWithEncodedServerResponse(
    args,
    'identity',
    Readable.from(
      Buffer.from(
        'You specified a content-type header, but the charset either was not specified or was not utf8 or utf-8 (case-insensitive). ' +
          'This server does not support charset sniffing and only supports utf-8. Repeat the request with the charset specified, ' +
          'for example: "Content-Type: application/json; charset=utf-8"'
      )
    )
  );
};
