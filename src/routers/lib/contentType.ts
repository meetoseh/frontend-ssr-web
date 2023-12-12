import { BAD_REQUEST_MESSAGE } from './errors';
import { parseMediaType } from './httpSemantics';
import { BufferPeekableStream } from './peekableStream';

export type ContentType = {
  /**
   * the main content type, e.g., 'application'
   */
  type: string;
  /**
   * the subtype, e.g., 'json'
   */
  subtype: string;
  /**
   * the parameters, with keys and values lowercased. When multiple parameters
   * with the same name are present, the last one wins.
   */
  parameters: { [key: string]: string };
};

/**
 * Parses the given content type header value as a media type:
 * https://www.rfc-editor.org/rfc/rfc9110#media.type
 *
 * @param contentType The content type header value
 * @throws Error if the content type is invalid
 */
export const parseContentType = (
  contentType: string | string[] | undefined
): ContentType | undefined => {
  if (contentType === undefined) {
    return undefined;
  }

  if (Array.isArray(contentType)) {
    if (contentType.length === 0) {
      return undefined;
    }
    contentType = contentType[0];
  }

  let parsed;
  try {
    parsed = parseMediaType(new BufferPeekableStream(Buffer.from(contentType, 'utf8')));
  } catch (e) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  const parameters: { [key: string]: string } = {};
  for (const [key, value] of parsed.parameters) {
    parameters[key.toLowerCase()] = value.toLowerCase();
  }

  return {
    type: parsed.type,
    subtype: parsed.subtype,
    parameters,
  };
};
