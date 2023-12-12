import { Duplex, Readable, Writable } from 'stream';
import { RouteBodyArgs } from './RouteBodyArgs';
import {
  BAD_REQUEST_MESSAGE,
  CONTENT_TIMEOUT_MESSAGE,
  DECOMPRESS_TIMEOUT_MESSAGE,
  PAYLOAD_TOO_LARGE_MESSAGE,
  READ_TIMEOUT_MESSAGE,
} from './errors';
import { finishWithBadRequest } from './finishWithBadRequest';
import { finishWithPayloadTooLarge } from './finishWithPayloadTooLarge';
import { finishWithServerError } from './finishWithServerError';
import { parseContentLength } from './parseContentLength';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { Callbacks } from '../../lib/Callbacks';
import { colorNow } from '../../logging';
import chalk from 'chalk';
import { JSONValue } from './openapi';
import { finishWithBadEncoding } from './finishWithBadEncoding';
import {
  AcceptableEncoding,
  acceptableEncodings,
  supportedEncodingDecompressors,
} from './acceptEncoding';
import { ContentType, parseContentType } from './contentType';
import { finishWithMissingCharsetHint } from './finishWithMissingCharsetHint';

export type LoadBodyJsonOpts = {
  /**
   * The maximum size of the body to load, in bytes. If at any point we detect
   * the compressed or decompressed data exceeds this size, a 413 error will be
   * returned and the request finished.
   * @default 50MiB
   */
  maxBodySize?: number;

  /**
   * The strategy to use for deciding when the request body should be paged
   * to a file until its fully loaded, reducing average memory usage from
   * slow clients (or when we're being slow to respond). Paging reduces the
   * odds that a bunch of simultaneous requests will cause the server to
   * run out of memory and use the swap, slowing all requests down, increasing
   * the amount of memory used, requiring more swap, etc.
   *
   * Options:
   *
   * - `never`: Never page the request body to a temporary file
   * - `always`: Always page the request body to a temporary file
   * - `optimistic`: Page the request body to a temporary file if the content-length
   *   header is available and above a threshold. If the content-length header is
   *   not specified, we first load to memory and then switch to paging if the
   *   memory usage exceeds a threshold.
   * - `pessimistic`: Page the request body to a temporary file if the content-length
   *   header is not available or it is available and above a threshold.
   *
   * @default 'pessimistic'
   */
  pageStrategy?: 'never' | 'always' | 'optimistic' | 'pessimistic';

  /**
   * If the body is compressed as indicated by the request header 'content-encoding',
   * this specifies the strategy to use for decompressing it.
   *
   * Note that we are careful to avoid compression bombs. A very small compressed
   * payload can lead to a massive decompressed payload, so it's not sufficient
   * to just check the compressed size. Instead, we decompress in chunks so we
   * can trigger a 413 if the decompressed size exceeds the `maxBodySize` before
   * having to decompress the entire body.
   *
   * Options:
   *
   * - `page`: We will decompress chunks at a time, streaming them to a temporary
   *   file until the entire body is decompressed. As we do this, if we exceed
   *   the `maxBodySize`, immediately cancel everything (and cleanup) and switch
   *   to a 413 response.
   * - `memory`: We will decompress chunks at a time, streaming them into memory
   *   until the entire body is decompressed. As we do this, if we exceed the
   *   `maxBodySize`, immediately cancel everything (and cleanup) and switch to
   *   a 413 response.
   * - `auto`: The choice will depend on where the request body is currently
   *   located (memory or stream) and its size. Furthermore, if decompression
   *   causes the body to exceed a threshold and we were using memory decompression,
   *   we switch to paging (until the entire body is decompressed or we exceed
   *   the `maxBodySize`).
   *
   * @default 'auto'
   */
  decompressStrategy?: 'page' | 'memory' | 'auto';
};

/**
 * When using the `pageStrategy` `optimistic`, the size in bytes where we switch
 * from using memory to paging the request body to a temporary file.
 */
const OPTIMISTIC_MEMORY_PAGE_THRESHOLD = 1024 * 1024;
/**
 * When using the `pageStrategy` `pessimistic`, the size in bytes where we switch
 * from using memory to paging the request body to a temporary file.
 */
const PESSIMISTIC_MEMORY_PAGE_THRESHOLD = 1024 * 1024;
/**
 * When using the `decompressStrategy` `auto`, the size in bytes for the compressed
 * payload to start with file paging instead of memory decompression.
 */
const AUTOMATIC_DECOMPRESSION_COMPRESSED_SIZE_PAGE_THRESHOLD = 1024 * 512;
/**
 * When using the `decompressStrategy` `auto`, the size in bytes for the decompressed
 * payload to switch to file paging instead of memory decompression.
 */
const AUTOMATIC_DECOMPRESSION_DECOMPRESSED_SIZE_PAGE_THRESHOLD = 1024 * 1024;

/**
 * Used when we're streaming the request body to memory but no content-length is
 * available. This only occurs if the page strategy is either `optimistic` or
 * `always`. Since we don't know how big the request is, we have to guess how much
 * memory to allocate.
 *
 * The strategy is as follows:
 * - Initially allocate min(MEMORY_MIN_ALLOCATION, maxBodySize) bytes. Since this
 *   is pretty small, this will almost certainly be smaller than maxBodySize.
 * - Whenever we exceed that amount, double the allocation (not exceeding maxBodySize)
 *
 * So for a 45MiB request without a content-length encoding, assuming a 50MiB
 * maxBodySize, the allocations would be 64KiB, 128KiB, 256KiB, 512KiB, 1MiB,
 * 2MiB, 4MiB, 8MiB, 16MiB, 32MiB, 50MiB.
 */
const MEMORY_MIN_ALLOCATION = 1024 * 64;

/**
 * If, during decompression of a payload, the decompressed size exceeds this
 * multiple of the compressed size, we will immediately cancel the decompression
 * and return a 400 Bad Request. Note that we rely on the chunks being within a
 * sane range: if they are tiny, you could easily get wild compression ratios
 * for a small part of a document, and if they are large, this is unlikely to
 * stop the problem before the standard size limits are reached.
 *
 * A typical flat gzip bomb will get a compression ratio close to 1000, so this
 * must be less than that to be effective. I haven't seen formatted json
 * compress better than 20:1 in practice, so that would be a reasonable lower
 * bound
 */
const COMPRESSION_BOMB_RATIO = 100;

/**
 * Loads the body of the request as JSON, and returns it. If the request is canceled,
 * this returns a resolved promise (rather than an error). The route body should check
 * args.state.finishing after this is done and return if it is true. This supports
 * a Content-Encoding of any of the `acceptableEncodings`, and will properly detect
 * and abort compression bombs.
 *
 * This handles checking the Content-Type header, and will not attempt to parse the
 * body unless it's acceptable.
 *
 * @param args The route body standard locals
 * @param opts Options for loading the body
 * @returns undefined if the request was canceled, otherwise the parsed JSON
 * @see ./acceptEncoding#acceptableEncodings
 */
export const loadBodyJson = async (
  args: RouteBodyArgs,
  opts: LoadBodyJsonOpts
): Promise<JSONValue | undefined> => {
  if (args.state.finishing) {
    return;
  }

  const realOpts: Required<LoadBodyJsonOpts> = Object.assign(
    {
      maxBodySize: 50 * 1024 * 1024,
      pageStrategy: 'pessimistic',
      decompressStrategy: 'auto',
    },
    opts
  );

  return new Promise<JSONValue | undefined>(async (resolve, reject) => {
    if (args.state.finishing) {
      resolve(undefined);
      return;
    }

    let encodedContentLengthHint: number | undefined;
    try {
      encodedContentLengthHint = parseContentLength(args.req.headers['content-length']);
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === PAYLOAD_TOO_LARGE_MESSAGE) {
          finishWithPayloadTooLarge(args)
            .then(() => resolve(undefined))
            .catch((e2: any) => reject(e2));
          return;
        } else if (e.message === BAD_REQUEST_MESSAGE) {
          finishWithBadRequest(args)
            .then(() => resolve(undefined))
            .catch((e2: any) => reject(e2));
          return;
        }
        finishWithServerError(args, e)
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
      } else {
        finishWithServerError(args, new Error('failed to parse content-length'))
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
      }
      return;
    }

    if (encodedContentLengthHint !== undefined && encodedContentLengthHint > realOpts.maxBodySize) {
      finishWithPayloadTooLarge(args)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    const rawEncoding = args.req.headers['content-encoding'];
    let encoding: AcceptableEncoding = 'identity';

    if (rawEncoding !== undefined) {
      if (rawEncoding.includes(',')) {
        finishWithBadEncoding(args)
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
        return;
      }

      // It is not acceptable to include whitespace at the beginning of
      // a list: https://www.rfc-editor.org/rfc/rfc9110#abnf.extension
      const trimmedEncoding = rawEncoding.trimEnd();

      if (!(acceptableEncodings as string[]).includes(trimmedEncoding)) {
        finishWithBadEncoding(args)
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
        return;
      }

      encoding = trimmedEncoding as AcceptableEncoding;
    }

    let contentType: ContentType | undefined;
    try {
      contentType = parseContentType(args.req.headers['content-type']);
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === BAD_REQUEST_MESSAGE) {
          finishWithBadRequest(args)
            .then(() => resolve(undefined))
            .catch((e2: any) => reject(e2));
          return;
        }
      }
      finishWithServerError(
        args,
        e instanceof Error ? e : new Error(`parseContentType error: ${e}`)
      )
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }
    if (
      contentType === undefined ||
      contentType.type !== 'application' ||
      contentType.subtype !== 'json'
    ) {
      finishWithBadRequest(args)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    if (contentType.parameters.charset !== 'utf-8' && contentType.parameters.charset !== 'utf8') {
      finishWithMissingCharsetHint(args)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    let compressed;
    try {
      compressed = await readCompressed(args, realOpts, encodedContentLengthHint);
    } catch (e) {
      if (args.state.finishing) {
        reject(e);
        return;
      }

      finishWithServerError(args, e instanceof Error ? e : new Error(`readCompressed error: ${e}`))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }
    if (args.state.finishing) {
      return;
    }

    if (compressed === undefined) {
      finishWithServerError(args, new Error('compressed unexpectedly undefined'))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    let decompressed;
    try {
      decompressed = await decompress(args, realOpts, compressed, encoding);
    } catch (e) {
      if (args.state.finishing) {
        resolve(undefined);
        return;
      }

      finishWithServerError(args, e instanceof Error ? e : new Error(`decompress error: ${e}`))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }
    if (args.state.finishing) {
      return;
    }

    if (decompressed === undefined) {
      finishWithServerError(args, new Error('decompressed unexpectedly undefined'))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    // now that we know everything is ready we will load it all into
    // memory to parse it as json. it may be faster to parse directly
    // from file, but there's no native support and it's not worth a
    // library for it as the improvement is likely to be small

    let decompressedAsBuffer;
    try {
      decompressedAsBuffer = await getAsBuffer(decompressed);
    } catch (e) {
      finishWithServerError(args, new Error('failed to retrieve decompressed after storing'))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    let stringified;
    try {
      stringified = decompressedAsBuffer.toString('utf-8');
    } catch (e) {
      finishWithBadRequest(args)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }

    try {
      const parsed = JSON.parse(stringified);
      resolve(parsed);
    } catch (e) {
      finishWithBadRequest(args)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
      return;
    }
  });
};

/**
 * Reads just the compressed body from the given request. This is intended as a
 * helper for `loadBodyJson` and may assume arbitrary validation has already
 * been done on the request, without which this has undefined behavior.
 *
 * @returns If the body was read successfully, returns the compressed body
 *   stream (which will clean up the temporary file, if any, when it is closed)
 *   and the compressed size. If the body could not be read and we've already
 *   handled the response, resolves to undefined. Rejects only on unreconcilable
 *   errors that should be bubbled to the top-level error handler.
 */
function readCompressed(
  args: RouteBodyArgs,
  opts: Required<LoadBodyJsonOpts>,
  encodedContentLengthHint: number | undefined
): Promise<{ stream: Readable; size: number; buffer: Buffer | undefined } | undefined> {
  return new Promise((resolve, reject) => {
    const store: TemporaryTransientDataStore = (() => {
      if (opts.pageStrategy === 'always') {
        return createFileOnlyStore(encodedContentLengthHint ?? opts.maxBodySize);
      }

      if (opts.pageStrategy === 'never') {
        return createMemoryOnlyStore(encodedContentLengthHint ?? opts.maxBodySize);
      }

      if (opts.pageStrategy === 'optimistic') {
        if (encodedContentLengthHint === undefined) {
          return createMemoryToFileAtThresholdStore(
            OPTIMISTIC_MEMORY_PAGE_THRESHOLD,
            opts.maxBodySize
          );
        }

        if (encodedContentLengthHint <= OPTIMISTIC_MEMORY_PAGE_THRESHOLD) {
          return createMemoryOnlyStore(encodedContentLengthHint);
        }

        return createFileOnlyStore(encodedContentLengthHint ?? opts.maxBodySize);
      }

      if (opts.pageStrategy === 'pessimistic') {
        if (
          encodedContentLengthHint === undefined ||
          encodedContentLengthHint > PESSIMISTIC_MEMORY_PAGE_THRESHOLD
        ) {
          return createFileOnlyStore(encodedContentLengthHint ?? opts.maxBodySize);
        }

        return createMemoryOnlyStore(encodedContentLengthHint);
      }

      ((badStrategy: never) => {
        throw new Error(`unknown pageStrategy: ${badStrategy}`);
      })(opts.pageStrategy);
    })();

    let finishing = false;
    let reading = false;
    let readingQueued = false;
    let endReached = false;
    let readTimeout: NodeJS.Timeout | null = setTimeout(onReadTimeout, 5000);
    let storeDrainTimeout: NodeJS.Timeout | null = null;

    args.state.cancelers.add(onRequestCanceled);

    args.req.addListener('error', onRequestError);
    args.req.addListener('readable', onRequestData);
    args.req.addListener('end', onRequestEnd);
    store.addListener('drain', onStoreDrained);
    store.addListener('error', onStoreError);

    function cleanup() {
      if (readTimeout !== null) {
        clearTimeout(readTimeout);
        readTimeout = null;
      }
      if (storeDrainTimeout !== null) {
        clearTimeout(storeDrainTimeout);
        storeDrainTimeout = null;
      }
      args.state.cancelers.remove(onRequestCanceled);
      args.req.removeListener('error', onRequestError);
      args.req.removeListener('readable', onRequestData);
      args.req.removeListener('end', onRequestEnd);
      store.removeListener('drain', onStoreDrained);
      store.removeListener('error', onStoreError);
      store.finishWritingAndAbort();
    }

    async function handleEnd() {
      if (finishing) {
        return;
      }

      finishing = true;
      const resultLength = store.tell();
      const buffer = store.buffer;
      const result = store.finishWritingAndCreateReadStream();

      cleanup();

      resolve({
        stream: result,
        size: resultLength,
        buffer,
      });
    }

    async function doReadLoop() {
      if (finishing || !store.drained) {
        return;
      }

      while (args.req.readable) {
        if (!store.drained) {
          return;
        }

        if (storeDrainTimeout !== null) {
          clearTimeout(storeDrainTimeout);
          storeDrainTimeout = null;
        }

        const chunk: Buffer | null = args.req.read();
        if (finishing) {
          return;
        }

        if (chunk === null) {
          break;
        }

        if (readTimeout !== null) {
          clearTimeout(readTimeout);
          readTimeout = null;
        }

        if (!store.write(chunk)) {
          if (!finishing && storeDrainTimeout === null && !store.drained) {
            storeDrainTimeout = setTimeout(onDrainTimeout, 1000);
          }
          return;
        }

        if (!finishing && readTimeout === null) {
          readTimeout = setTimeout(onReadTimeout, 5000);
        }
      }

      if (endReached) {
        await handleEnd();
      }
    }

    function startOrExtendReadLoop() {
      if (reading) {
        readingQueued = true;
        return;
      }

      reading = true;
      doReadLoop().finally(() => {
        reading = false;
        if (readingQueued) {
          readingQueued = false;
          startOrExtendReadLoop();
        }
      });
    }

    function onRequestData() {
      if (finishing) {
        return;
      }

      startOrExtendReadLoop();
    }

    function onRequestEnd() {
      if (finishing) {
        return;
      }

      endReached = true;
      startOrExtendReadLoop();
    }

    function onRequestError() {
      if (finishing) {
        return;
      }

      finishing = true;
      cleanup();
      finishWithServerError(args, new Error('request error'))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
    }

    function onRequestCanceled() {
      if (finishing) {
        return;
      }

      finishing = true;
      cleanup();
      resolve(undefined);
    }

    function onStoreDrained() {
      if (finishing) {
        return;
      }

      startOrExtendReadLoop();
    }

    function onStoreError(e: Error) {
      if (finishing) {
        return;
      }

      finishing = true;
      cleanup();
      finishWithServerError(args, e)
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
    }

    function onReadTimeout() {
      if (finishing) {
        return;
      }

      finishing = true;
      cleanup();
      finishWithServerError(args, new Error(READ_TIMEOUT_MESSAGE))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
    }

    function onDrainTimeout() {
      if (finishing) {
        return;
      }

      finishing = true;
      cleanup();
      finishWithServerError(args, new Error(CONTENT_TIMEOUT_MESSAGE))
        .then(() => resolve(undefined))
        .catch((e2: any) => reject(e2));
    }
  });
}

/**
 * Decompresses the given compressed body which has the given content-encoding.
 */
function decompress(
  args: RouteBodyArgs,
  opts: Required<LoadBodyJsonOpts>,
  compressed: { stream: Readable; size: number; buffer: Buffer | undefined },
  encoding: AcceptableEncoding
): Promise<{ stream: Readable; size: number; buffer: Buffer | undefined } | undefined> {
  return new Promise<{ stream: Readable; size: number; buffer: Buffer | undefined } | undefined>(
    (resolve, reject) => {
      if (args.state.finishing) {
        resolve(undefined);
        return;
      }

      if (encoding === 'identity') {
        resolve(compressed);
        return;
      }

      const store: TemporaryTransientDataStore = (() => {
        if (opts.decompressStrategy === 'page') {
          return createFileOnlyStore(opts.maxBodySize);
        } else if (opts.decompressStrategy === 'memory') {
          return createMemoryOnlyStore(opts.maxBodySize);
        } else if (opts.decompressStrategy === 'auto') {
          if (compressed.size >= AUTOMATIC_DECOMPRESSION_COMPRESSED_SIZE_PAGE_THRESHOLD) {
            return createFileOnlyStore(opts.maxBodySize);
          } else {
            return createMemoryToFileAtThresholdStore(
              AUTOMATIC_DECOMPRESSION_DECOMPRESSED_SIZE_PAGE_THRESHOLD,
              opts.maxBodySize
            );
          }
        }

        ((badStrategy: never) => {
          throw new Error(`unknown decompressStrategy: ${badStrategy}`);
        })(opts.decompressStrategy);
      })();

      let compressedBytesTakenSoFar = 0;
      let decompressorIn: Readable;
      const pushDataToDecompressorIn = (size: number) => {
        let chunk: Buffer | null = compressed.stream.read(size);
        if (chunk !== null) {
          compressedBytesTakenSoFar += chunk.byteLength;
          decompressorIn.push(chunk);
        }
        return true;
      };
      decompressorIn = new Readable({
        read: pushDataToDecompressorIn,
      });
      const decompressorOut = supportedEncodingDecompressors[encoding](decompressorIn);

      let finishing = false;

      let readingDecompressed = false;
      let readingDecompressedQueued = false;
      let readingDecompressedEndReached = false;
      let decompressedBytesTakenSoFar = 0;

      let readTimeoutDecompressed: NodeJS.Timeout | null = setTimeout(
        onReadTimeoutDecompressed,
        1250
      );
      let drainTimeoutDecompressed: NodeJS.Timeout | null = null;

      args.state.cancelers.add(onRequestCanceled);
      decompressorOut.on('readable', onDecompressorOutData);
      decompressorOut.on('error', onDecompressorOutError);
      decompressorOut.on('end', onDecompressorOutEnd);
      decompressorOut.on('close', onDecompressorClose);
      store.addListener('drain', onStoreDrained);
      store.addListener('error', onStoreError);
      compressed.stream.on('readable', onCompressedData);
      compressed.stream.on('end', onCompressedEnd);

      function cleanup() {
        if (readTimeoutDecompressed !== null) {
          clearTimeout(readTimeoutDecompressed);
          readTimeoutDecompressed = null;
        }
        if (drainTimeoutDecompressed !== null) {
          clearTimeout(drainTimeoutDecompressed);
          drainTimeoutDecompressed = null;
        }
        args.state.cancelers.remove(onRequestCanceled);
        compressed.stream.removeListener('end', onCompressedEnd);
        store.removeListener('drain', onStoreDrained);
        store.removeListener('error', onStoreError);
        store.finishWritingAndAbort();
        decompressorIn.destroy();
        decompressorOut.destroy();
      }

      function handleDecompressingEnd() {
        if (finishing) {
          return;
        }

        finishing = true;
        const resultLength = store.tell();
        const buffer = store.buffer;
        const result = store.finishWritingAndCreateReadStream();
        cleanup();
        resolve({
          stream: result,
          size: resultLength,
          buffer,
        });
      }

      function doDecompressingReadLoop() {
        if (finishing) {
          return;
        }

        while (store.drained && decompressorOut.readable) {
          let chunk: Buffer | null = decompressorOut.read();
          if (finishing) {
            return;
          }

          if (chunk === null) {
            break;
          }

          if (readTimeoutDecompressed !== null) {
            clearTimeout(readTimeoutDecompressed);
            readTimeoutDecompressed = null;
          }

          decompressedBytesTakenSoFar += chunk.byteLength;
          if (compressedBytesTakenSoFar * COMPRESSION_BOMB_RATIO < decompressedBytesTakenSoFar) {
            finishing = true;
            console.log(
              `${colorNow()} compression bomb detected and mitigated; ` +
                `decompressed at most ${compressedBytesTakenSoFar.toLocaleString()} of the provided ${compressed.size.toLocaleString()} bytes, ` +
                `and mitigation triggered when the decompressed size was ${decompressedBytesTakenSoFar.toLocaleString()} bytes, ` +
                `which is ${(
                  decompressedBytesTakenSoFar / compressedBytesTakenSoFar
                ).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}x the compressed size`
            );
            cleanup();
            finishWithBadRequest(args)
              .then(() => resolve(undefined))
              .catch((e2: any) => reject(e2));
            return;
          }

          if (!store.write(chunk)) {
            if (drainTimeoutDecompressed === null) {
              drainTimeoutDecompressed = setTimeout(onDrainTimeoutDecompressed, 1000);
            }
            break;
          }

          if (readTimeoutDecompressed === null) {
            readTimeoutDecompressed = setTimeout(onReadTimeoutDecompressed, 1250);
          }
        }

        if (readingDecompressedEndReached && store.drained) {
          handleDecompressingEnd();
        }
      }

      function startOrExtendDecompressingReadLoop() {
        if (finishing) {
          return;
        }

        readingDecompressedQueued = true;

        if (readingDecompressed) {
          return;
        }

        readingDecompressed = true;
        try {
          while (readingDecompressedQueued && !finishing) {
            readingDecompressedQueued = false;
            doDecompressingReadLoop();
          }
        } finally {
          readingDecompressed = false;
        }
      }

      function onStoreDrained() {
        startOrExtendDecompressingReadLoop();
      }

      function onStoreError(e: Error) {
        if (finishing) {
          return;
        }

        finishing = true;
        cleanup();
        finishWithServerError(args, e)
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
      }

      function onDecompressorOutData() {
        startOrExtendDecompressingReadLoop();
      }

      function onDecompressorOutEnd() {
        readingDecompressedEndReached = true;
        startOrExtendDecompressingReadLoop();
      }

      function onDecompressorClose() {}

      function onDecompressorOutError() {
        if (finishing) {
          return;
        }

        finishing = true;
        cleanup();
        finishWithBadRequest(args)
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
      }

      function onCompressedData() {
        pushDataToDecompressorIn(1024);
      }

      function onCompressedEnd() {
        decompressorIn.push(null);
      }

      function onDecompressTimeout() {
        if (finishing) {
          return;
        }

        finishing = true;
        cleanup();
        finishWithServerError(args, new Error(DECOMPRESS_TIMEOUT_MESSAGE))
          .then(() => resolve(undefined))
          .catch((e2: any) => reject(e2));
      }

      function onReadTimeoutDecompressed() {
        onDecompressTimeout();
      }

      function onDrainTimeoutDecompressed() {
        onDecompressTimeout();
      }

      function onRequestCanceled() {
        if (finishing) {
          return;
        }

        finishing = true;
        cleanup();
        resolve(undefined);
      }
    }
  );
}

/**
 * Describes a writable that can be transitioned to a readable
 */
type TemporaryTransientDataStore = {
  /**
   * True if we can accept more data without simply buffering
   * in memory, false if more time is needed to actually accept
   * more data. Use `on('drain', ...)` to detect when this changes
   * to true, and the result of write to see when it changes to
   * false.
   */
  get drained(): boolean;
  /**
   * If the entire contents of the store are in memory, returns
   * a buffer storing just the contents, otherwise undefined. This
   * is intended to avoid unnecessary copying when the store is
   * already in memory.
   */
  get buffer(): Buffer | undefined;
  /**
   * Returns how much data has been written in
   * bytes
   */
  tell(): number;
  /**
   * Adds a listener for the given event.
   */
  addListener: {
    /**
     * Emitted when the store is ready to receive more data without
     * buffering to memory (when buffering to memory is not the
     * intended behavior)
     */
    (event: 'drain', listener: (_: undefined) => void): void;
    /**
     * Emitted when an error occurs.
     */
    (event: 'error', listener: (e: Error) => void): void;
  };

  /**
   * Removes the given listener for the given event.
   */
  removeListener: {
    (event: 'drain', listener: (_: undefined) => void): void;
    (event: 'error', listener: (e: Error) => void): void;
  };
  /**
   * Writes the given chunk to the store, returning true if this can accept more
   * data without simply buffering to memory (assuming buffering to memory is
   * not the intended behavior), false if more time is needed.
   *
   * If this is not open (i.e., either error has been emitted or one of the
   * finishWritingXXX functions have been called), this does nothing and returns
   * false.
   *
   * All of our implementations will have some predefined maximum acceptable
   * length, and if this write would cause that length to be exceeded than the
   * error event will be emitted with 'payload too large' as the error message.
   */
  write: (chunk: Buffer) => boolean;
  /**
   * Stops writing and deletes the data. No-op after an error has been
   * emitted or any of the finishWritingXXX functions have been called.
   */
  finishWritingAndAbort: () => void;
  /**
   * Stops writing and returns a readable for all the data that was read. When
   * the readable is closed the data is deleted.
   */
  finishWritingAndCreateReadStream: () => Readable;
};

function getAsBuffer(store: {
  stream: Readable;
  size: number;
  buffer: Buffer | undefined;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (store.buffer !== undefined) {
      resolve(store.buffer);
      return;
    }

    const result = Buffer.alloc(store.size);
    let offset = 0;
    let finishing = false;

    const finalStream = new Writable({
      write(chunk) {
        chunk.copy(result, offset);
        offset += chunk.byteLength;
        return true;
      },
    });

    finalStream.on('close', () => {
      if (finishing) {
        return;
      }
      finishing = true;
      resolve(result);
    });

    store.stream.on('error', (e) => {
      if (finishing) {
        return;
      }
      finishing = true;
      store.stream.destroy();
      finalStream.destroy();
      reject(e);
    });

    store.stream.pipe(finalStream);
  });
}

/**
 * Creates a temporary transient data store which exclusively buffers
 * to memory. This corresponds to the paging strategy 'never'
 */
const createMemoryOnlyStore = (maxSize: number): TemporaryTransientDataStore => {
  let state: 'open' | 'closed' | 'error' = 'open';
  let data = Buffer.alloc(Math.min(MEMORY_MIN_ALLOCATION, maxSize));
  let writtenSize = 0;

  const callbacksByEvent = {
    drain: new Callbacks<undefined>(),
    error: new Callbacks<Error>(),
  };

  return {
    get drained() {
      return true;
    },

    get buffer() {
      return data.subarray(0, writtenSize);
    },

    tell() {
      return writtenSize;
    },

    addListener: (event, listener) => {
      callbacksByEvent[event].add(listener as any);
    },

    removeListener: (event, listener) => {
      callbacksByEvent[event].remove(listener as any);
    },

    write(chunk) {
      if (state !== 'open') {
        return false;
      }

      if (writtenSize + chunk.byteLength < data.byteLength) {
        chunk.copy(data, writtenSize);
        writtenSize += chunk.byteLength;
        return true;
      }

      if (writtenSize + chunk.byteLength > maxSize) {
        state = 'error';
        data = Buffer.alloc(0);
        callbacksByEvent.error.call(new Error(PAYLOAD_TOO_LARGE_MESSAGE));
        return false;
      }

      let newBufferSize = data.byteLength * 2;
      while (newBufferSize < writtenSize + chunk.byteLength && newBufferSize < maxSize) {
        newBufferSize *= 2;
      }
      newBufferSize = Math.min(newBufferSize, maxSize);
      const newData = Buffer.alloc(newBufferSize);
      data.copy(newData);
      data = newData;

      chunk.copy(data, writtenSize);
      writtenSize += chunk.byteLength;
      return true;
    },

    finishWritingAndAbort() {
      if (state !== 'open') {
        return;
      }
      data = Buffer.alloc(0);
      state = 'closed';
    },

    finishWritingAndCreateReadStream() {
      if (state !== 'open') {
        throw new Error('Cannot create read stream, store is not open');
      }

      const readable = Readable.from(data);
      data = Buffer.alloc(0);
      state = 'closed';
      return readable;
    },
  };
};

/**
 * Creates a temporary transient data store which exclusively uses
 * a temporary file to store data. This corresponds to the paging
 * strategy 'always'. This can raise errors when it is called if
 * it cannot access the required file descriptor.
 */
const createFileOnlyStore = (maxSize: number): TemporaryTransientDataStore => {
  let state: 'open' | 'closed' | 'error' = 'open';
  let drained = true;
  const filePath = path.join('tmp', crypto.randomBytes(16).toString('base64url'));
  let fileWriteStream: Writable | undefined = fs.createWriteStream(filePath);
  let writtenSize = 0;

  const callbacksByEvent = {
    drain: new Callbacks<undefined>(),
    error: new Callbacks<Error>(),
  };

  fileWriteStream.on('error', (e) => {
    if (state !== 'open') {
      return;
    }

    state = 'error';
    fileWriteStream = undefined;
    callbacksByEvent.error.call(e);
  });

  fileWriteStream.on('close', () => {
    if (state === 'closed') {
      return;
    }

    if (state !== 'error') {
      state = 'error';
      fileWriteStream = undefined;
      callbacksByEvent.error.call(new Error('unexpected close'));
    }

    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn(
        `${colorNow()}: ${chalk.redBright(`leaked temporary file`)} ${chalk.white(filePath)}`,
        e
      );
    }
  });

  fileWriteStream.on('drain', () => {
    if (state !== 'open') {
      return;
    }

    drained = true;
    callbacksByEvent.drain.call(undefined);
  });

  return {
    get drained() {
      return drained;
    },

    get buffer() {
      return undefined;
    },

    tell() {
      return writtenSize;
    },

    addListener: (event, listener) => {
      callbacksByEvent[event].add(listener as any);
    },

    removeListener: (event, listener) => {
      callbacksByEvent[event].remove(listener as any);
    },

    write(chunk) {
      if (state !== 'open' || fileWriteStream === undefined) {
        return false;
      }

      if (writtenSize + chunk.byteLength > maxSize) {
        state = 'error';
        fileWriteStream.destroy(new Error(PAYLOAD_TOO_LARGE_MESSAGE));
        return false;
      }

      writtenSize += chunk.byteLength;
      drained = fileWriteStream.write(chunk);
      return drained;
    },

    finishWritingAndAbort() {
      if (state !== 'open' || fileWriteStream === undefined) {
        return;
      }

      state = 'closed';

      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        timeout = null;
        console.warn(
          `${colorNow()}: ${chalk.red('very slow closing temporary file (leaked?)')} ${chalk.white(
            filePath
          )}`
        );
      }, 1000);

      fileWriteStream.end(() => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn(`${colorNow()}: ${chalk.redBright(`leaked temporary file ${filePath}`)}`, e);
        }
      });
      fileWriteStream = undefined;
    },

    finishWritingAndCreateReadStream() {
      if (state !== 'open' || fileWriteStream === undefined) {
        throw new Error('Cannot create read stream, store is not open');
      }

      console.log('flipping file to read mode');

      state = 'closed';

      let readableState: FileOnlyStoreReadableState =
        FileOnlyStoreReadableState.WaitingForWritableToClose;

      let underlyingReadable: Readable | undefined = undefined;
      let readable: Readable;

      const pushDataToReadable = () => {
        if (
          underlyingReadable !== undefined &&
          readableState === FileOnlyStoreReadableState.Piped
        ) {
          const chunk: Buffer | null = underlyingReadable.read();
          if (chunk !== null) {
            readable.push(chunk);
          }
        }

        return null;
      };

      readable = new Readable({
        read: pushDataToReadable,
      });

      let endTimeout: NodeJS.Timeout | null = setTimeout(() => {
        endTimeout = null;
        console.warn(
          `${colorNow()} ${chalk.redBright(
            'very slow closing temporary file (leaked?)'
          )} ${chalk.white(filePath)}`
        );
      }, 1000);

      fileWriteStream.end(() => {
        if (endTimeout !== null) {
          clearTimeout(endTimeout);
          endTimeout = null;
        }

        if (readable.destroyed) {
          readableState = FileOnlyStoreReadableState.Cleaned;
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.warn(
              `${colorNow()}: ${chalk.redBright(`leaked temporary file ${filePath}`)}`,
              e
            );
          }
          return;
        }

        readableState = FileOnlyStoreReadableState.WaitingForReadableToOpen;
        try {
          underlyingReadable = fs.createReadStream(filePath);
          underlyingReadable.on('error', (e) => {
            if (
              readableState !== FileOnlyStoreReadableState.Closed &&
              readableState !== FileOnlyStoreReadableState.Cleaned
            ) {
              readableState = FileOnlyStoreReadableState.Closed;
              underlyingReadable?.destroy();
              readable.emit('error', e);
            }
          });
          underlyingReadable.on('readable', () => {
            if (readableState === FileOnlyStoreReadableState.Piped) {
              pushDataToReadable();
            }
          });
          underlyingReadable.on('close', () => {
            if (readableState === FileOnlyStoreReadableState.Cleaned) {
              return;
            }
            if (readableState === FileOnlyStoreReadableState.Piped) {
              readable.push(null);
            }
            readableState = FileOnlyStoreReadableState.Cleaned;
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              console.warn(
                `${colorNow()}: ${chalk.redBright(`leaked temporary file ${filePath}`)}`,
                e
              );
            }
          });
          readable.on('close', () => {
            underlyingReadable?.destroy();
          });
          if (readable.destroyed) {
            readableState = FileOnlyStoreReadableState.Closed;
            underlyingReadable.destroy();
            return;
          }
          readableState = FileOnlyStoreReadableState.Piped;
        } catch (e) {
          if (readableState !== FileOnlyStoreReadableState.WaitingForReadableToOpen) {
            return;
          }

          readableState = FileOnlyStoreReadableState.Closed;
          readable.emit('error', e);
          readable.push(null);
        }
      });

      return readable;
    },
  };
};

/**
 * Creates a temporary transient data store which buffers to memory
 * until the given threshold is reached, at which point it switches
 * to file. This corresponds to the paging strategy 'optimistic'
 * when a content-length header is omitted.
 */
const createMemoryToFileAtThresholdStore = (
  maxMemorySize: number,
  maxFileSize: number
): TemporaryTransientDataStore => {
  let state: 'open-memory' | 'open-file' | 'closed' = 'open-memory';
  let delegate: TemporaryTransientDataStore = createMemoryOnlyStore(maxMemorySize);

  const callbacksByEvent = {
    drain: new Callbacks<undefined>(),
    error: new Callbacks<Error>(),
  };

  delegate.addListener('drain', handleDelegateDrain);
  delegate.addListener('error', handleDelegateError);

  function handleDelegateDrain() {
    callbacksByEvent.drain.call(undefined);
  }

  function handleDelegateError(e: Error) {
    callbacksByEvent.error.call(e);
  }

  return {
    get drained() {
      return delegate.drained;
    },

    get buffer() {
      return delegate.buffer;
    },

    tell() {
      return delegate.tell();
    },

    addListener: (event, listener) => {
      callbacksByEvent[event].add(listener as any);
    },

    removeListener: (event, listener) => {
      callbacksByEvent[event].remove(listener as any);
    },

    write(chunk) {
      if (state === 'open-memory' && delegate.tell() + chunk.byteLength > maxMemorySize) {
        if (delegate.tell() + chunk.byteLength > maxFileSize) {
          state = 'closed';
          delegate.finishWritingAndAbort();
          callbacksByEvent.error.call(new Error(PAYLOAD_TOO_LARGE_MESSAGE));
          return false;
        }

        let newDelegate;
        try {
          newDelegate = createFileOnlyStore(maxFileSize);
        } catch (e) {
          state = 'closed';
          delegate.finishWritingAndAbort();
          callbacksByEvent.error.call(
            e instanceof Error ? e : new Error(`error opening file: ${e}`)
          );
          return false;
        }

        delegate.removeListener('drain', handleDelegateDrain);
        delegate.removeListener('error', handleDelegateError);

        let expectedTransferSize = delegate.tell();
        let transferedSoFar = 0;
        const readableToCopyOver = delegate.finishWritingAndCreateReadStream();
        // since we know this a memory stream we are going to assume we can
        // transfer the whole amount immediately
        while (readableToCopyOver.readable) {
          const chunk = readableToCopyOver.read() as Buffer | null;
          if (chunk === null) {
            break;
          }
          transferedSoFar += chunk.byteLength;
          newDelegate.write(chunk);
        }
        readableToCopyOver.destroy();

        if (transferedSoFar !== expectedTransferSize) {
          state = 'closed';
          console.warn(
            `${colorNow()}: ${chalk.redBright(
              `failed to transfer memory buffer to file: ${transferedSoFar} !== ${expectedTransferSize}`
            )}`
          );
          newDelegate.finishWritingAndAbort();
          callbacksByEvent.error.call(new Error('failed to transfer memory buffer to file'));
          return false;
        }

        state = 'open-file';
        newDelegate.addListener('drain', handleDelegateDrain);
        newDelegate.addListener('error', handleDelegateError);
        delegate = newDelegate;
      }

      if (state !== 'open-file' && state !== 'open-memory') {
        return false;
      }

      return delegate.write(chunk);
    },

    finishWritingAndAbort() {
      state = 'closed';
      delegate.finishWritingAndAbort();
    },

    finishWritingAndCreateReadStream() {
      state = 'closed';
      return delegate.finishWritingAndCreateReadStream();
    },
  };
};

enum FileOnlyStoreReadableState {
  WaitingForWritableToClose = 1,
  WaitingForReadableToOpen,
  Piped,
  Closed,
  Cleaned,
}
