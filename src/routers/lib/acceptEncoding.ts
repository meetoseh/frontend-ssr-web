import { ServerResponse } from 'http';
import { Readable } from 'stream';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { Callbacks } from '../../lib/Callbacks';
import { createCancelablePromiseFromCallbacks } from '../../lib/createCancelablePromiseFromCallbacks';
import { createGzip, createBrotliCompress, createGunzip, createBrotliDecompress } from 'zlib';
import { createCancelableTimeout } from '../../lib/createCancelableTimeout';
import { CONTENT_TIMEOUT_MESSAGE, WRITE_TIMEOUT_MESSAGE } from './errors';
import { writeServerResponse } from '../../lib/writeServerResponse';
import { RouteBodyArgs } from './RouteBodyArgs';
import { colorNow } from '../../logging';
import * as httpSemantics from './httpSemantics';
import { BufferPeekableStream } from './peekableStream';

export type Coding = {
  identifier: string;
  quality: number;
};

export type KnownCoding = {
  identifier: AcceptableEncoding;
  quality: number;
};

/**
 * Parses the given Accept-Encoding header into the codings it contains. If multiple
 * accept-encoding headers are given, the first one is used. The returned codings
 * are not sorted.
 *
 * A returned encoding of '*' indicates that the client accepts any encoding, which
 * is also used when no Accept-Encoding header is given. If an empty accept encoding
 * is given, the 'identity' encoding is returned. Otherwise, the result is a faithful
 * representation of the Accept-Encoding header.
 *
 * If the header cannot be parsed, we assume the client only accepts the 'identity'
 * encoding.
 *
 * @param acceptEncoding The Accept-Encoding header to parse.
 * @returns The codings the client accepts.
 */
export const parseAcceptEncoding = (acceptEncodingRaw: string | string[] | undefined): Coding[] => {
  const acceptEncoding = (() => {
    if (acceptEncodingRaw === undefined) {
      return '*';
    }

    if (Array.isArray(acceptEncodingRaw)) {
      if (acceptEncodingRaw.length < 1) {
        return '*';
      }
      return acceptEncodingRaw[0];
    }

    return acceptEncodingRaw;
  })();

  if (acceptEncoding === '') {
    return [{ identifier: 'identity', quality: 1 }];
  }

  let parsedAcceptEncoding;
  try {
    parsedAcceptEncoding = httpSemantics.parseAcceptEncoding(
      new BufferPeekableStream(Buffer.from(acceptEncoding, 'utf8'))
    );
  } catch (e) {
    return [{ identifier: 'identity', quality: 1 }];
  }

  return parsedAcceptEncoding.map((raw) => ({
    identifier: raw.codings,
    quality: raw.weight ? parseFloat(raw.weight) : 1,
  }));
};

/**
 * The encodings that are supported by the server. The keys are the identifiers
 * of encodings, and the values are functions that take a stream and return a
 * stream that encodes the given stream with the encoding.
 */
export const supportedEncodings = {
  gzip: (stream: Readable): Readable => {
    return stream.pipe(createGzip());
  },
  br: (stream: Readable): Readable => {
    return stream.pipe(createBrotliCompress());
  },
  identity: (stream: Readable): Readable => {
    return stream;
  },
};

export const supportedEncodingDecompressors = {
  gzip: (stream: Readable): Readable => {
    return stream.pipe(createGunzip());
  },
  br: (stream: Readable): Readable => {
    return stream.pipe(createBrotliDecompress());
  },
  identity: (stream: Readable): Readable => {
    return stream;
  },
};
/**
 * The encodings which we accept from the client and might return.
 */
export type AcceptableEncoding = keyof typeof supportedEncodings;

// used to break ties when multiple codings have the same quality
const encodingPriority = {
  identity: 0,
  gzip: 1,
  br: 2,
};

/**
 * The acceptable encodings in no particular order.
 */
export const acceptableEncodings: AcceptableEncoding[] = Object.keys(
  supportedEncodings
) as AcceptableEncoding[];

/**
 * The response header value that should be used when rejecting a request due to
 * an unsupported encoding. Note that the order of the encodings can be meaningful,
 * which is why this should be used rather than constructing the header value
 * manually.
 */
export const acceptableEncodingsHeader = acceptableEncodings
  .slice()
  .sort((a, b) => encodingPriority[b] - encodingPriority[a])
  .join(', ');

/**
 * Selects the known coding to use, given the codings the client accepts. If the client
 * accepts no known codings, the 'identity' coding is returned.
 *
 * @param codings The codings the client accepts, with preference information
 * @returns The coding to use, or null if no known coding is acceptable
 */
export const selectEncoding = (codings: Coding[]): null | AcceptableEncoding => {
  const knownCodings = codings.filter(
    (coding) => coding.identifier in supportedEncodings
  ) as KnownCoding[];

  if (knownCodings.length < codings.length) {
    const catchall = codings.find((coding) => coding.identifier === '*');
    if (catchall !== undefined) {
      const givenLookup = new Set(knownCodings.map((coding) => coding.identifier));
      for (const identRaw in supportedEncodings) {
        const identifier = identRaw as AcceptableEncoding;
        if (!givenLookup.has(identifier)) {
          knownCodings.push({ identifier: identifier, quality: catchall.quality });
        }
      }
    }
  }

  if (knownCodings.length === 0) {
    return null;
  }

  const sortedCodings = knownCodings.sort((a, b) => {
    if (a.quality === b.quality) {
      return encodingPriority[b.identifier] - encodingPriority[a.identifier];
    }
    return b.quality - a.quality;
  });

  if (sortedCodings[0].quality === 0) {
    return null;
  }

  return sortedCodings[0].identifier;
};

/**
 * Writes the server response to the given stream, encoding it as appropriate based on
 * the given codings. This always ends the request, as most encodings cannot be continued
 * from chunks naively, i.e., they have specific framing requirements.
 *
 * This is a fairly low-level implementation; it's typically better to use
 * `finishWithEncodedServerResponse` instead, which accepts the standard route body args.
 *
 * @param resp The server response to stream to
 * @param coding The coding to use
 * @param stream The stream to read from. Should be in the paused state, which is the default.
 *   This will consume from the stream in paused mode to avoid backpressure issues.
 */
export const streamEncodedServerResponse = (
  resp: ServerResponse,
  coding: AcceptableEncoding,
  stream: Readable
): CancelablePromise<void> => {
  let done = false;
  let finishing = false;

  const cancelers = new Callbacks<undefined>();

  return {
    done: () => done,
    cancel: () => {
      if (!finishing && !done) {
        finishing = true;
        cancelers.call(undefined);
      }
    },
    promise: new Promise<void>((resolve, reject) => {
      if (finishing) {
        reject(new Error('canceled'));
        return;
      }

      const canceled = createCancelablePromiseFromCallbacks(cancelers);

      let reading = false;
      let readingQueued = false;
      let endReached = false;
      let contentTimeoutReached = false;
      let contentTimeout: NodeJS.Timeout | null = setTimeout(onContentTimeout, 5000);
      cancelers.add(() => {
        if (contentTimeout !== null) {
          clearTimeout(contentTimeout);
          contentTimeout = null;
        }
      });
      const adaptedStream = supportedEncodings[coding](stream);

      adaptedStream.on('error', (e) => {
        if (finishing) {
          return;
        }

        finishing = true;
        cancelers.call(undefined);
        reject(e);
      });
      adaptedStream.on('readable', () => {
        onReadable();
      });
      adaptedStream.on('end', () => {
        endReached = true;
        onReadable();
      });
      adaptedStream.on('close', () => {
        if (!endReached) {
          console.log(`${colorNow()} ${coding} stream closed before end`);
          endReached = true;
          onReadable();
        }
      });
      if (adaptedStream.readableEnded) {
        endReached = true;
      }
      if (adaptedStream.readable || endReached) {
        onReadable();
      }
      return;

      async function handleEnd() {
        if (contentTimeout !== null) {
          clearTimeout(contentTimeout);
          contentTimeout = null;
        }

        const endPromise = new Promise<void>((resolve) => {
          resp.end(resolve);
        });

        const timeout = createCancelableTimeout(5000);

        try {
          await Promise.race([canceled.promise, endPromise, timeout.promise]);
        } catch (e) {
          canceled.cancel();
          timeout.cancel();
          if (finishing) {
            return;
          }
          finishing = true;
          cancelers.call(undefined);
          reject(e);
          return;
        }

        if (finishing) {
          timeout.cancel();
          return;
        }

        if (timeout.done()) {
          finishing = true;
          cancelers.call(undefined);
          reject(new Error(WRITE_TIMEOUT_MESSAGE));
          return;
        }

        finishing = true;
        cancelers.call(undefined);
        if (contentTimeoutReached) {
          reject(new Error(CONTENT_TIMEOUT_MESSAGE));
        } else {
          resolve();
        }
      }

      async function pipeToResponse() {
        if (finishing) {
          return;
        }

        while (adaptedStream.readable) {
          const chunk = adaptedStream.read();
          if (chunk === null) {
            break;
          }

          if (!Buffer.isBuffer(chunk)) {
            throw new Error('streamEncodedServerResponse: expected buffer');
          }

          if (contentTimeout !== null) {
            clearTimeout(contentTimeout);
            contentTimeout = null;
          }

          const write = writeServerResponse(resp, chunk, { endStream: false, chunkTimeout: 5000 });
          try {
            await Promise.race([write.promise, canceled.promise]);
          } catch (e) {
            write.cancel();
            canceled.cancel();
            if (finishing) {
              return;
            }
            finishing = true;
            cancelers.call(undefined);
            reject(e);
            return;
          }

          if (finishing) {
            return;
          }

          if (contentTimeout !== null) {
            clearTimeout(contentTimeout);
          }
          contentTimeout = setTimeout(onContentTimeout, 5000);
        }

        if (endReached) {
          await handleEnd();
        }
      }

      function onReadable() {
        if (reading) {
          readingQueued = true;
          return;
        }

        reading = true;
        pipeToResponse().finally(() => {
          reading = false;
          if (!finishing && readingQueued) {
            readingQueued = false;
            onReadable();
          }
        });
      }

      function onContentTimeout() {
        contentTimeout = null;
        if (finishing) {
          return;
        }
        contentTimeoutReached = true;
        handleEnd();
      }
    }).finally(() => {
      done = true;
    }),
  };
};

/**
 * Takes over the rest of the route body implementation, writing the server response
 * with the given coding using the given stream, where the stream provides the
 * unencoded body. This handles the appropriate write and content timeouts required
 * to write content. Note this does not write any headers directly.
 *
 * @param args The route body args
 * @param coding The coding to use
 * @param stream The paused stream to use to send the response body
 * @param error If specified, instead of resolving when done, we reject with
 *   this error. Used primarily for indicating a timeout was the issue in
 *   the logs. Only used if we were able to write the response, otherwise
 *   the error is ignored in favor of the error that caused the response
 *   not to be written.
 */
export const finishWithEncodedServerResponse = async (
  args: RouteBodyArgs,
  coding: AcceptableEncoding,
  stream: Readable,
  error?: Error
) => {
  if (args.state.finishing) {
    return;
  }

  let writePromise = streamEncodedServerResponse(args.resp, coding, stream);
  try {
    await Promise.race([args.canceled.promise, writePromise.promise]);
  } catch (e) {
    writePromise.cancel();
    if (args.state.finishing) {
      return;
    }

    args.state.finishing = true;
    args.state.cancelers.call(undefined);
    args.reject(e);
    return;
  }

  if (args.state.finishing) {
    writePromise.cancel();
    return;
  }

  args.state.finishing = true;
  args.state.cancelers.call(undefined);
  if (error === undefined) {
    args.resolve();
  } else {
    args.reject(error);
  }
};
