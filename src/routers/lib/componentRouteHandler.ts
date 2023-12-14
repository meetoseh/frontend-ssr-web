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
   * at the appropriate time for the script to call hydrateRoot(). It is executed
   * after window.__INITIAL_PROPS__ is set, if they are set.
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
  body: (routerPrefix: string) => (args: RouteBodyArgs) => Promise<{
    /** The element to render on the server */
    element: ReactElement;
    /** If specified, set to `window.__INITIAL_PROPS__` for client-side hydration */
    props?: object;
  }>,
  options?: (routePrefix: string) => ComponentRouteOptions
): ((
  routerPrefix: string
) => (req: IncomingMessage, resp: ServerResponse) => CancelablePromise<void>) => {
  return (routerPrefix: string) => {
    const optionsCached = options?.(routerPrefix);
    const realBody = body(routerPrefix);

    const handler = simpleRouteHandler(async (args) => {
      const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
      if (coding === null) {
        return finishWithBadEncoding(args);
      }

      const isCrawler = args.req.headers['user-agent']?.match(/bot|crawler|spider/i);

      const pageData = await realBody(args);
      const component = pageData.element;
      const props = pageData.props;
      if (args.state.finishing) {
        return;
      }

      let shellReadyPromiseResolve: () => void = () => {};
      const shellReadyPromise = new Promise<void>((resolve) => {
        shellReadyPromiseResolve = resolve;
      });

      const scriptContentParts = [];
      if (props !== undefined) {
        scriptContentParts.push(`window.__INITIAL_PROPS__ = ${JSON.stringify(props)};`);
      }
      if (optionsCached?.bootstrapScriptContent !== undefined) {
        scriptContentParts.push(optionsCached.bootstrapScriptContent);
      }
      const scriptContents = scriptContentParts.join('\n');

      const { pipe, abort } = renderToPipeableStream(component, {
        bootstrapModules: optionsCached?.bootstrapModules,
        bootstrapScriptContent: scriptContents,
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

    return handler(routerPrefix);
  };
};
