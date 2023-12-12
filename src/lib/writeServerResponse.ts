import { ServerResponse } from 'http';
import { CancelablePromise } from './CancelablePromise';
import { Callbacks } from './Callbacks';
import { createCancelablePromiseFromCallbacks } from './createCancelablePromiseFromCallbacks';
import { createCancelableTimeout } from './createCancelableTimeout';
import { WRITE_TIMEOUT_MESSAGE } from '../routers/lib/errors';

/**
 * Writes the given response to the server response in chunks, waiting for each
 * chunk to complete before continuing
 *
 * @param resp The server response to write to
 * @param content The content to write
 * @param opts.chunkSize The size of each chunk to write
 * @param opts.chunkTimeout The timeout for writing a given chunk, in ms
 * @param opts.endStream Whether to end the stream after writing the content
 * @returns A cancelable promise that resolves when the response was written and rejects on the
 *   first error
 */
export const writeServerResponse = (
  resp: ServerResponse,
  content: Buffer,
  opts: {
    chunkSize?: number;
    chunkTimeout?: number;
    endStream: boolean;
  }
): CancelablePromise<void> => {
  let tentativelyDone = false;
  let done = false;
  const cancelers = new Callbacks<undefined>();

  const chunkSize = opts.chunkSize ?? 1024 * 16;
  const chunkTimeout = opts.chunkTimeout ?? 5000;

  return {
    done: () => done,
    cancel: () => {
      if (!tentativelyDone) {
        tentativelyDone = true;
        cancelers.call(undefined);
      }
    },
    promise: new Promise<void>(async (resolve, reject) => {
      if (tentativelyDone) {
        reject(new Error('canceled'));
        return;
      }

      const canceled = createCancelablePromiseFromCallbacks(cancelers);

      let curIndex = 0;
      while (curIndex < content.length) {
        const timeoutPromise = createCancelableTimeout(chunkTimeout);
        const writePromise = writeChunk(resp, content, curIndex, chunkSize, opts.endStream);
        try {
          await Promise.race([writePromise, canceled.promise, timeoutPromise.promise]);
        } catch (e) {
          canceled.cancel();
          timeoutPromise.cancel();
          if (tentativelyDone) {
            reject(new Error('canceled'));
            return;
          }
          tentativelyDone = true;
          reject(e);
          return;
        }

        if (tentativelyDone) {
          reject(new Error('canceled'));
          return;
        }

        if (timeoutPromise.done()) {
          reject(new Error(WRITE_TIMEOUT_MESSAGE));
          return;
        }

        curIndex += chunkSize;
      }

      resolve();
    }).finally(() => {
      done = true;
    }),
  };
};

const writeChunk = (
  resp: ServerResponse,
  content: Buffer,
  startIndex: number,
  chunkSize: number,
  endStream: boolean
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const toWrite = content.subarray(startIndex, Math.min(startIndex + chunkSize, content.length));
    const cb = (err?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    if (endStream && startIndex + chunkSize >= content.length) {
      resp.end(toWrite, cb);
    } else {
      resp.write(toWrite, cb);
    }
  });
};
