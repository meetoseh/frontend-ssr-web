import { ReactElement } from 'react';
import { RouteBodyArgs } from './RouteBodyArgs';
import { IncomingMessage, ServerResponse } from 'http';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { simpleRouteHandler } from './simpleRouteHandler';
import { renderToPipeableStream } from 'react-dom/server';
import {
  finishWithEncodedServerResponse,
  parseAcceptEncoding,
  selectEncoding,
} from './acceptEncoding';
import { finishWithBadEncoding } from './finishWithBadEncoding';
import { STANDARD_VARY_RESPONSE } from './constants';
import { Stream } from 'stream';
import { Callbacks } from '../../lib/Callbacks';

export type ComponentRouteOptions = {
  /**
   * These scripts are injected into the page via <script type="module">
   * at the appropriate time for the script to call hydrateRoot().
   */
  bootstrapModules?: string[];

  /**
   * This script content is injected into the page via <script type="text/javascript">
   * at the appropriate time for the script to call hydrateRoot().
   */
  bootstrapScriptContent?: string;
};

/**
 * Manages serving an HTML page using a ReactElement which will render
 * an html tag. This requires that you have already prepared the required
 * javascript bundle and have another route for serving it. Use
 * `createWebpackComponent` to assist with bundling.
 */
export const componentRouteHandler = (
  body: (args: RouteBodyArgs) => Promise<ReactElement>,
  options?: (routePrefix: string) => ComponentRouteOptions
): ((
  routerPrefix: string
) => (req: IncomingMessage, resp: ServerResponse) => CancelablePromise<void>) => {
  let optionsCached: ComponentRouteOptions | undefined = undefined;

  const handler = simpleRouteHandler(async (args) => {
    const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
    if (coding === null) {
      return finishWithBadEncoding(args);
    }

    const isCrawler = args.req.headers['user-agent']?.match(/bot|crawler|spider/i);

    const component = await body(args);
    if (args.state.finishing) {
      return;
    }

    let shellReadyPromiseResolve: () => void = () => {};
    const shellReadyPromise = new Promise<void>((resolve) => {
      shellReadyPromiseResolve = resolve;
    });

    const { pipe, abort } = renderToPipeableStream(component, {
      bootstrapModules: optionsCached?.bootstrapModules,
      bootstrapScriptContent: optionsCached?.bootstrapScriptContent,
      onShellReady() {
        if (args.state.finishing) {
          return;
        }

        if (isCrawler) {
          return;
        }

        shellReadyPromiseResolve();
      },
      onAllReady() {
        if (args.state.finishing) {
          return;
        }
        if (!isCrawler) {
          return;
        }
        shellReadyPromiseResolve();
      },
      onShellError(e) {
        if (args.state.finishing) {
          return;
        }

        args.state.finishing = true;
        args.resp.statusCode = 500;
        args.resp.statusMessage = 'Internal Server Error';
        args.resp.end();
        args.reject(e);
      },
    });
    args.state.cancelers.add(abort);

    await Promise.race([shellReadyPromise, args.canceled.promise]);
    if (args.state.finishing) {
      return;
    }

    args.resp.statusCode = 200;
    args.resp.statusMessage = 'OK';
    args.resp.setHeader('Content-Type', 'text/html');
    args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
    args.resp.setHeader('Content-Encoding', coding);

    let wantPush = false;
    const readDesired = new Callbacks<undefined>();
    const readable = new Stream.Readable({
      read: () => {
        wantPush = true;
        readDesired.call(undefined);
      },
    });
    const writable = new Stream.Writable({
      write(chunk, encoding, callback) {
        const handler = () => {
          readable.push(chunk);
          wantPush = false;
          readDesired.remove(handler);
          callback();
        };

        if (wantPush) {
          handler();
        } else {
          readDesired.add(handler);
        }
      },
    });
    writable.on('finish', () => {
      readable.push(null);
    });
    args.state.cancelers.add(() => {
      readable.destroy();
      writable.destroy();
    });
    pipe(writable);

    return finishWithEncodedServerResponse(args, coding, readable);
  });

  return (routerPrefix: string) => {
    optionsCached = options?.(routerPrefix);
    return handler(routerPrefix);
  };
};
