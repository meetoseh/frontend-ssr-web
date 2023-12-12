/**
 * Used if it takes too long to write to the client, despite
 * data being available
 */
export const WRITE_TIMEOUT_MESSAGE = 'write timeout';
/**
 * Used if it takes too long to read from the client
 */
export const READ_TIMEOUT_MESSAGE = 'read timeout';
/**
 * Used if it takes too long to decide what content to respond to
 * the client with, usually raised from helper functions like
 * streamEncodedServerResponse
 */
export const CONTENT_TIMEOUT_MESSAGE = 'content timeout';
/**
 * Used when the payload provided by the client takes too long to
 * decompress, usually a sign of a compression bomb.
 */
export const DECOMPRESS_TIMEOUT_MESSAGE = 'decompress timeout';

/**
 * Used if the function wants the caller to return bad request
 * to the client. This is only used in unlikely circumstances,
 * e.g., a content-length header which is not RFC 9110 compliant
 */
export const BAD_REQUEST_MESSAGE = 'bad request';
/**
 * Used if the function wants the caller to return payload too large,
 * usually by helpers for body parsing. Functions like `loadBodyJson`
 * will usually catch and handle this error, so most routes do not
 * need to worry about it.
 */
export const PAYLOAD_TOO_LARGE_MESSAGE = 'payload too large';
