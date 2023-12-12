import { BAD_REQUEST_MESSAGE, PAYLOAD_TOO_LARGE_MESSAGE } from './errors';

/**
 * Parses the content-length request header
 *
 * @param contentLength The content-length header value
 * @returns The parsed content-length, or undefined if it is not present.
 * @throws BAD_REQUEST If the content-length is not RFC 9110 compliant
 * @throws PAYLOAD_TOO_LARGE If the content-length is greater than MAX_SAFE_INTEGER
 */
export const parseContentLength = (contentLength: string | undefined): number | undefined => {
  if (contentLength === undefined) {
    return undefined;
  }

  if (contentLength.length > 16) {
    throw new Error(PAYLOAD_TOO_LARGE_MESSAGE);
  }

  if (!/^[0-9]+$/.test(contentLength)) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  if (contentLength.length === 16) {
    // alphabetic comparison is sufficient in this case, and we don't
    // want to compare numbers due to overflow
    if (contentLength > Number.MAX_SAFE_INTEGER.toString()) {
      throw new Error(PAYLOAD_TOO_LARGE_MESSAGE);
    }
  }

  let parsed;
  try {
    parsed = parseInt(contentLength, 10);
  } catch (e) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  if (isNaN(parsed)) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  if (parsed < 0) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  return parsed;
};
