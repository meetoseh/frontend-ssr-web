/*
 * This module helps parsing common HTTP semantics, following
 * https://www.rfc-editor.org/rfc/rfc9110#name-collected-abnf
 * using recursive descent. This is primarily focused on values
 * that show up in headers.
 *
 * A typical usecase of this module would be:
 *
 * ```ts
 * import * as httpSemantics from './httpSemantics';
 * import { BufferPeekableStream } from './peekableStream';
 *
 * const contentType = httpSemantics.parseContentType(
 *   new BufferPeekableStream(Buffer.from('application/json; charset=utf-8', 'utf-8')));
 * // contentType is now: { type: 'application', subtype: 'json', parameters: [['charset', 'utf-8']] }
 * ```
 *
 * The module implementation follows a similar pattern to
 * https://en.wikipedia.org/wiki/Recursive_descent_parser
 *
 * The types of functions in this module depend on their prefix:
 *
 * - `accept` functions, which are given the peakable stream and return true if
 *   the stream contains the expected value next. These functions do not ever
 *   advance the stream, nor do they ever throw. For example, `acceptToken` will
 *   return true if a token is next, but will not advance the stream.
 * - `acceptUnsafe` functions are similar to `accept` functions, but they may
 *   return true without completely checking the expected value. For example,
 *   `acceptUnsafeQuotedString` may be implemented just by checking if the next
 *   character is a double quote, and not checking the rest of the string. These
 *   functions may contains qualifiers, e.g, `acceptUnsafeWeightRatherThanComma`
 *   would describe a function which is only sufficient for confirming that the
 *   next value is definitely not a comma and could be a weight.
 * - `expect` functions, which are given the peakable stream and advance
 *   the stream if the expected value is next. These functions throw if the
 *   expected value is not next.
 * - `parse` functions, which are given the peakable stream and will
 *   simultaneously advance the stream and return a value. These functions
 *   throw if the expected value is not next, which must cover the same cases
 *   as `expect`
 * - `parseUnsafe` functions are similar to `parse` functions, but they MUST
 *   only be included if there is a corresponding `accept` or `expect` function
 *   and they may assume that the `accept` function would return true (or,
 *   equivalently, that the `expect` function would not throw). Their behavior
 *   is undefined if the `accept` function would return false.
 *
 * NOTE:
 *   It is expected that many types will either not have an accept function or
 *   the accept function will not be used. These are types where it can be known
 *   in advance that the next value is definitely the expected value. For example,
 *   parameter-value is the only acceptable value in a parameter after the equality
 *   sign, so there is no need to check acceptParameterValue before attempting to
 *   parse.
 *
 *   In other cases, an accept function wouldn't make sense because an empty string
 *   is an acceptable value. For example, `parameters` is listed as 0-infinitely
 *   many `parameter`s. Thus its trivially true that the next value is parameters, because
 *   if it's not a valid parameter then it's an empty list of parameters!
 */

import { PeekableScanner, PeekableStream } from './peekableStream';

const SPECIAL_TCHARS = Buffer.from("!#$%&'*+-.^_`|~", 'ascii');

const isTchar = (codePoint: number): boolean => {
  return (
    (codePoint >= 97 && codePoint <= 122) ||
    (codePoint >= 65 && codePoint <= 90) ||
    (codePoint >= 48 && codePoint <= 57) ||
    SPECIAL_TCHARS.includes(codePoint)
  );
};

/**
 * Checks if the next value in the stream is a valid character within
 * a token.
 */
export const acceptTchar = (stream: PeekableStream): boolean => {
  if (stream.remaining < 1) {
    return false;
  }

  return isTchar(stream.peekExactly(1)[0]);
};

/**
 * Parses the next character as a tchar, without validation. Not typically
 * used directly since this particular operation greatly benefits from
 * bulk parsing using by token
 */
export const parseUnsafeTchar = (stream: PeekableStream): string => {
  return stream.readExactly(1).toString('ascii');
};

/**
 * Checks if the stream continues onto a token. Since tokens can be
 * 1-length, this is the same as checking if the next value is a tchar.
 */
export const acceptToken = acceptTchar;

const nextNotTcharScanner = (buf: Buffer, isEof: boolean): number | null => {
  // PERF: this is a good candidate for vectorization
  for (let i = 0; i < buf.length; i++) {
    if (!isTchar(buf[i])) {
      return i;
    }
  }
  return isEof ? -1 : null;
};

/**
 * Consumes the next token from the stream, only stopping when a non-tchar
 * is encountered (or the end of the stream is reached).
 */
export const parseToken = (stream: PeekableStream): string => {
  let endOffset = stream.scan(nextNotTcharScanner);
  if (endOffset === -1) {
    endOffset = stream.remaining;
  }
  if (endOffset === 0) {
    throw new Error(`expected token at ${stream.tell()}`);
  }
  return stream.readExactly(endOffset).toString('ascii');
};

export const acceptType = acceptToken;
export const parseType = parseToken;

export const acceptSubtype = acceptToken;
export const parseSubtype = parseToken;

export const acceptParameterName = acceptToken;
export const parseParameterName = parseToken;

const isObsText = (codePoint: number): boolean => {
  return codePoint >= 128 && codePoint <= 255;
};

const isQdText = (codePoint: number): boolean => {
  return (
    codePoint === 9 ||
    codePoint === 32 ||
    codePoint === 33 ||
    (codePoint >= 35 && codePoint <= 91) ||
    (codePoint >= 93 && codePoint <= 126) ||
    isObsText(codePoint)
  );
};

const isValidQuotedPairSecondCodePoint = (codePoint: number): boolean => {
  return (
    codePoint === 9 ||
    codePoint === 32 ||
    (codePoint >= 33 && codePoint <= 126) ||
    isObsText(codePoint)
  );
};

const isQuotedPair = (firstCodePoint: number, secondCodePoint: number): boolean => {
  return firstCodePoint === 92 && isValidQuotedPairSecondCodePoint(secondCodePoint);
};

const quotedStringEndScanner: PeekableScanner = (buf, isEof) => {
  let escaped = false;
  for (let i = 0; i < buf.length; i++) {
    if (escaped) {
      if (!isValidQuotedPairSecondCodePoint(buf[i])) {
        return -1;
      }
      escaped = false;
    } else if (buf[i] === 34) {
      return i;
    } else if (buf[i] === 92) {
      escaped = true;
    } else if (!isQdText(buf[i])) {
      return -1;
    }
  }

  if (isEof) {
    return -1;
  }

  if (escaped) {
    return { minOverlapOnNext: 1 };
  }

  return null;
};

/**
 * Checks if the next value in the stream corresponds to a quoted string,
 * e.g., "foobar". Empty quoted strings are allowed, i.e., "".
 */
export const acceptQuotedString = (stream: PeekableStream): boolean => {
  if (stream.remaining < 2) {
    return false;
  }
  if (stream.peekExactly(1)[0] !== 34) {
    return false;
  }

  return stream.scan(quotedStringEndScanner, 1) !== -1;
};

/**
 * Checks if the next character in the stream is a double quote, which
 * is the start of a quoted string. This does not check if the quoted
 * string is valid, e.g., if it is terminated and only contains valid
 * characters.
 */
export const acceptUnsafeQuotedString = (stream: PeekableStream): boolean => {
  if (stream.remaining < 1) {
    return false;
  }
  return stream.peekExactly(1)[0] === 34;
};

/**
 * Parses the next value in the stream as a quoted string, e.g., "foobar".
 * Returns the contents of the quoted string, i.e., without the quotes.
 * This handles escaping, so e.g., "foo\"bar" would return the string
 * foo"bar
 *
 * Invalid utf-8 characters are replaced with \uFFFD.
 */
export const parseQuotedString = (stream: PeekableStream): string => {
  if (stream.remaining < 2) {
    throw new Error(`expected quoted string at ${stream.tell()}`);
  }

  if (stream.peekExactly(1)[0] !== 34) {
    throw new Error(`expected quoted string at ${stream.tell()}`);
  }

  const endOffset = stream.scan(quotedStringEndScanner, 1);
  if (endOffset === -1) {
    throw new Error(`expected quoted string at ${stream.tell()}`);
  }

  stream.readExactly(1);
  const rawResult = stream.readExactly(endOffset - 2);
  stream.readExactly(1);

  // fast-path the case where no escaping is necessary
  if (!rawResult.includes(92)) {
    return rawResult.toString('utf-8');
  }

  const newResult = Buffer.allocUnsafe(rawResult.length);
  let writtenSize = 0;

  let escaped = false;
  for (let i = 0; i < rawResult.length; i++) {
    if (escaped) {
      newResult[writtenSize] = rawResult[i];
      writtenSize++;
      escaped = false;
    } else if (rawResult[i] === 92) {
      escaped = true;
    } else {
      newResult[writtenSize] = rawResult[i];
      writtenSize++;
    }
  }

  return newResult.subarray(0, writtenSize).toString('utf-8');
};

// Not exported since this is not actually named in the name collected ABNF
// section, though it is used in a few spots. Does exactly what the name implies
const acceptTokenOrQuotedString = (stream: PeekableStream): boolean => {
  return acceptQuotedString(stream) || acceptToken(stream);
};

const parseTokenOrQuotedString = (stream: PeekableStream): string => {
  if (acceptUnsafeQuotedString(stream)) {
    return parseQuotedString(stream);
  }
  return parseToken(stream);
};

export const acceptParameterValue = acceptTokenOrQuotedString;
export const parseParameterValue = parseTokenOrQuotedString;

export const acceptUnsafeParameter = acceptTchar;

/**
 * Parses a parameter, e.g., `foo="bar"`.
 */
export const parseParameter = (stream: PeekableStream): [string, string] => {
  const name = parseParameterName(stream);
  if (stream.remaining < 1) {
    throw new Error(`expected '=' at ${stream.tell()}`);
  }
  if (stream.readExactly(1)[0] !== 61) {
    throw new Error(`expected '=' at ${stream.tell()}`);
  }
  const value = parseParameterValue(stream);
  return [name, value];
};

const isWhitespace = (codePoint: number): boolean => codePoint === 32 || codePoint === 9;

export const parseOptionalWhiteSpace = (stream: PeekableStream): void => {
  while (stream.remaining > 0) {
    const next = stream.peekExactly(1)[0];
    if (isWhitespace(next)) {
      stream.advance(1);
    } else {
      return;
    }
  }
};

const parseCodePoint = (stream: PeekableStream, codePoint: number): void => {
  if (stream.remaining < 1 || stream.peekExactly(1)[0] !== codePoint) {
    throw new Error(`expected ${String.fromCodePoint(codePoint)} at ${stream.tell()}`);
  }
  stream.advance(1);
};

export const parseParameters = (stream: PeekableStream): [string, string][] => {
  // NOTE: This consumes optional whitespace even if there are no parameters.
  // This is technically against the spec
  const result: [string, string][] = [];
  while (true) {
    parseOptionalWhiteSpace(stream);
    if (stream.remaining < 1 || stream.peekExactly(1)[0] !== 59) {
      return result;
    }
    stream.advance(1);
    parseOptionalWhiteSpace(stream);

    if (acceptUnsafeParameter(stream)) {
      result.push(parseParameter(stream));
    }
  }
};

/**
 * Parses a media type with optional parameters, e.g.,
 * `application/json; charset=utf-8`.
 */
export const parseMediaType = (
  stream: PeekableStream
): {
  type: string;
  subtype: string;
  parameters: [string, string][];
} => {
  const type = parseType(stream);
  parseCodePoint(stream, 47);
  const subtype = parseSubtype(stream);
  const parameters = parseParameters(stream);
  return {
    type,
    subtype,
    parameters,
  };
};

// identity and * are both valid tokens and thus need no special parsing
export const parseCodings = parseToken;

// scans for the index of the "0" or "1" in a weight string, validating
// along the way
const acceptWeightScanner: PeekableScanner = (buf, isEof) => {
  let semicolonAt = -1;

  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 59) {
      semicolonAt = i;
      break;
    }

    if (!isWhitespace(buf[i])) {
      return -1;
    }
  }

  if (semicolonAt === -1) {
    return isEof ? -1 : null;
  }

  let qAt = -1;
  for (let i = semicolonAt + 1; i < buf.length; i++) {
    if (buf[i] === 113) {
      qAt = i;
      break;
    }

    if (!isWhitespace(buf[i])) {
      return -1;
    }
  }

  if (qAt === -1) {
    return isEof ? -1 : { minOverlapOnNext: buf.length - semicolonAt };
  }

  if (buf.length < qAt + 3) {
    return isEof ? -1 : { minOverlapOnNext: buf.length - semicolonAt };
  }

  if (buf[qAt + 1] !== 61) {
    return -1;
  }

  if (buf[qAt + 2] !== 48 && buf[qAt + 2] !== 49) {
    return -1;
  }

  return qAt + 2;
};

/**
 * Determines if the next value in the stream is a weight, e.g., `; q=0.5`.
 */
export const acceptWeight = (stream: PeekableStream): boolean => {
  return stream.scan(acceptWeightScanner) !== -1;
};

/**
 * Parses a weight, e.g., `; q=0.5`, to get the exact quality
 * string specified, e.g., '0.5'.
 */
export const parseWeight = (stream: PeekableStream): string => {
  const numberStartsAt = stream.scan(acceptWeightScanner);
  if (numberStartsAt === -1) {
    throw new Error(`expected weight at ${stream.tell()}`);
  }
  stream.advance(numberStartsAt);

  // The longest acceptable number is like "1.000"
  let peekedNumber = stream.peek(5);

  if (peekedNumber.length < 2 || peekedNumber[1] !== 46) {
    stream.advance(1);
    return String.fromCodePoint(peekedNumber[0]);
  }

  let numberFractionDigits = 0;
  while (
    2 + numberFractionDigits < peekedNumber.length &&
    peekedNumber[2 + numberFractionDigits] >= 48 &&
    peekedNumber[2 + numberFractionDigits] <= 57
  ) {
    numberFractionDigits++;
  }

  stream.advance(2 + numberFractionDigits);
  return peekedNumber.subarray(0, 2 + numberFractionDigits).toString('ascii');
};

const parseEof = (stream: PeekableStream): void => {
  if (stream.remaining > 0) {
    throw new Error(`expected end of stream at ${stream.tell()}`);
  }
};

/**
 * Parses an accept-encoding value, e.g., `*; q=0.5, gzip`. This module avoids
 * converting to number representations anywhere to avoid precision loss, but
 * the weights are guarranteed to be valid decimal numbers when present.
 */
export const parseAcceptEncoding = (
  stream: PeekableStream
): { codings: string; weight?: string }[] => {
  if (!acceptToken(stream)) {
    parseEof(stream);
    return [];
  }

  const result: { codings: string; weight?: string }[] = [];
  while (true) {
    const codings = parseCodings(stream);
    let weight: string | undefined = undefined;
    if (acceptWeight(stream)) {
      weight = parseWeight(stream);
    }

    result.push({ codings, weight });

    if (stream.remaining === 0) {
      return result;
    }

    parseOptionalWhiteSpace(stream);
    parseCodePoint(stream, 44);
    parseOptionalWhiteSpace(stream);
  }
};

/**
 * Parses a media-range, e.g., `text/html; charset=utf-8`.
 * NOTE: since * is a valid token, this is the same as parseMediaType
 */
export const parseMediaRange = parseMediaType;

type MediaRangeWithWeight = {
  type: string;
  subtype: string;
  parameters: [string, string][];
  weight?: string;
};

const weightRegex = /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/;
/**
 * Parses an Accept header, e.g.,
 * `text/html; charset=utf-8, text/plain; charset=utf-8; q=0.8, text/plain; q=0.3, text/*; q=0.1`
 */
export const parseAccept = (stream: PeekableStream): MediaRangeWithWeight[] => {
  const result: MediaRangeWithWeight[] = [];

  while (true) {
    const mediaRange: MediaRangeWithWeight = parseMediaRange(stream);
    for (let i = mediaRange.parameters.length - 1; i >= 0; i--) {
      const [k, v] = mediaRange.parameters[i];
      if (k === 'q') {
        if (!weightRegex.test(v)) {
          throw new Error(`invalid weight near ${stream.tell()}`);
        }

        mediaRange.parameters.splice(i, 1);
        if (mediaRange.weight === undefined) {
          mediaRange.weight = v;
        }
        break;
      }
    }

    result.push(mediaRange);
    if (stream.remaining === 0) {
      return result;
    }

    parseOptionalWhiteSpace(stream);
    parseCodePoint(stream, 44);
    parseOptionalWhiteSpace(stream);
  }
};
