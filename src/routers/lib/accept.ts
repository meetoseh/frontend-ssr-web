import { BAD_REQUEST_MESSAGE } from './errors';
import { parseAccept as parseAcceptRaw } from './httpSemantics';
import { BufferPeekableStream } from './peekableStream';

export type AcceptMediaRange = {
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
  /**
   * How much the client prefers this content type over others; a value
   * between 0 and 1 (inclusive).
   */
  weight: number;
};

export type AcceptMediaRangeWithoutWeight = Omit<AcceptMediaRange, 'weight'>;

/**
 * Parses the given accept header value to get the list of media ranges
 * and corresponding weights that the client accepts. If multiple accept
 * headers are provided, the first one is used. The result is unordered,
 * so `selectAccept` should be used to select the best match based on what
 * the server can provide.
 *
 * If an accept header is not provided, this assumes the catch-all range,
 * i.e., the client has no preference.
 *
 * https://www.rfc-editor.org/rfc/rfc9110#name-accept
 *
 * @param accept The accept header value
 * @throws Error if the accept header value is invalid
 */
export const parseAccept = (accept: string | string[] | undefined): AcceptMediaRange[] => {
  if (accept === undefined) {
    return [
      {
        type: '*',
        subtype: '*',
        parameters: {},
        weight: 1,
      },
    ];
  }

  if (Array.isArray(accept)) {
    if (accept.length === 0) {
      return [
        {
          type: '*',
          subtype: '*',
          parameters: {},
          weight: 1,
        },
      ];
    }
    accept = accept[0];
  }

  let parsed;
  try {
    parsed = parseAcceptRaw(new BufferPeekableStream(Buffer.from(accept, 'utf8')));
  } catch (e) {
    throw new Error(BAD_REQUEST_MESSAGE);
  }

  return parsed.map((range) => ({
    type: range.type,
    subtype: range.subtype,
    parameters: normalizeParameters(range.parameters),
    weight: range.weight === undefined ? 1 : parseFloat(range.weight),
  }));
};

/**
 * Selects the best match from the given list of available media ranges,
 * breaking ties by preferring the first one in the list.
 *
 * @param requested The list of media ranges the client accepts
 * @param sortedAvailable The list of media ranges the server can provide,
 *   already sorted by descending preference. We assume there are no catch-all
 *   ranges in this list, either by type or subtype.
 * @returns The best match from the list of available media ranges, or
 *   undefined if no match was found
 */
export const selectAccept = (
  requested: AcceptMediaRange[],
  sortedAvailable: AcceptMediaRangeWithoutWeight[]
): AcceptMediaRangeWithoutWeight | undefined => {
  const sortedRequested = requested.slice().sort((a, b) => b.weight - a.weight);

  for (const requested of sortedRequested) {
    for (const available of sortedAvailable) {
      let match = true;
      for (const [rkey, rval] of Object.entries(requested.parameters)) {
        if (available.parameters[rkey] !== rval) {
          match = false;
          break;
        }
      }

      if (!match) {
        continue;
      }

      if (requested.type !== '*' && requested.type !== available.type) {
        continue;
      }

      if (requested.subtype !== '*' && requested.subtype !== available.subtype) {
        continue;
      }

      return available;
    }
  }

  return undefined;
};

const normalizeParameters = (parameters: [string, string][]): Record<string, string> => {
  const result: { [key: string]: string } = {};
  for (const [key, value] of parameters) {
    result[key.toLowerCase()] = value.toLowerCase();
  }
  return result;
};
