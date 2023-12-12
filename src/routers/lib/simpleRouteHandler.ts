import { IncomingMessage, ServerResponse } from 'http';
import { constructCancelablePromise } from '../../lib/CancelablePromiseConstructor';
import { CancelablePromise } from '../../lib/CancelablePromise';
import { RouteBodyArgs } from './RouteBodyArgs';
import { createCancelablePromiseFromCallbacks } from '../../lib/createCancelablePromiseFromCallbacks';

/**
 * Implements a route handler using a standard cancelable promise constructor with
 * no preamble, then delegates to the given body function after merging in all the
 * arguments into a standardized RouteBodyArgs object which can be passed around.
 *
 * @param body The core of the route handler.
 * @returns The route handler.
 */
export const simpleRouteHandler = (
  body: (args: RouteBodyArgs) => Promise<void>
): ((
  routerPrefix: string
) => (req: IncomingMessage, resp: ServerResponse) => CancelablePromise<void>) => {
  return () => {
    return (req, resp) =>
      constructCancelablePromise<void>({
        body: (state, resolve, reject) => {
          body({
            state,
            resolve,
            reject,
            req,
            resp,
            canceled: createCancelablePromiseFromCallbacks(state.cancelers),
          }).catch((e) => {
            if (!state.finishing) {
              state.finishing = true;
              resp.statusCode = 500;
              resp.statusMessage = 'Internal Server Error';
              resp.end();
            }
            reject(e);
          });
        },
      });
  };
};
