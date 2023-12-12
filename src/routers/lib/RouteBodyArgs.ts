import { IncomingMessage, ServerResponse } from 'http';
import { CancelablePromiseBodyArgs } from '../../lib/CancelablePromiseConstructor';
import { CancelablePromise } from '../../lib/CancelablePromise';

/**
 * Convenience type for the body arguments of a route implementing the
 * CancelablePromiseConstructor interface
 */
export type RouteBodyArgs = CancelablePromiseBodyArgs<void> & {
  canceled: CancelablePromise<void>;
  req: IncomingMessage;
  resp: ServerResponse;
};
