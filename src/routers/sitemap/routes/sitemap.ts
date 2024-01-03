import { CommandLineArgs } from '../../../CommandLineArgs';
import { Callbacks } from '../../../lib/Callbacks';
import { CancelablePromise } from '../../../lib/CancelablePromise';
import { constructCancelablePromise } from '../../../lib/CancelablePromiseConstructor';
import { Itgs, withItgs } from '../../../lib/Itgs';
import { createCancelablePromiseFromCallbacks } from '../../../lib/createCancelablePromiseFromCallbacks';
import { AcceptMediaRangeWithoutWeight, parseAccept, selectAccept } from '../../lib/accept';
import {
  finishWithEncodedServerResponse,
  parseAcceptEncoding,
  selectEncoding,
} from '../../lib/acceptEncoding';
import { STANDARD_VARY_RESPONSE } from '../../lib/constants';
import { BAD_REQUEST_MESSAGE } from '../../lib/errors';
import { finishWithBadEncoding } from '../../lib/finishWithBadEncoding';
import { finishWithBadRequest } from '../../lib/finishWithBadRequest';
import { finishWithNotAcceptable } from '../../lib/finishWithNotAcceptable';
import { PendingRoute } from '../../lib/route';
import { simpleRouteHandler } from '../../lib/simpleRouteHandler';
import { RouteWithPrefix } from '../../openapi/routes/schema';
import { SitemapEntry, StreamedSitemap } from '../lib/Sitemap';
import { createResponseStreamForSitemap } from '../lib/createResponseStreamForSitemap';

const acceptableByFormat: Record<'xml' | 'plain', AcceptMediaRangeWithoutWeight[]> = {
  xml: [
    { type: 'text', subtype: 'xml', parameters: { charset: 'utf-8' } },
    { type: 'text', subtype: 'xml', parameters: { charset: 'utf8' } },
    { type: 'text', subtype: 'xml', parameters: { charset: 'ascii' } },
    { type: 'text', subtype: 'xml', parameters: {} },
  ],
  plain: [
    { type: 'text', subtype: 'plain', parameters: { charset: 'utf-8' } },
    { type: 'text', subtype: 'plain', parameters: { charset: 'utf8' } },
    { type: 'text', subtype: 'plain', parameters: { charset: 'ascii' } },
    { type: 'text', subtype: 'plain', parameters: {} },
    { type: 'text', subtype: 'csv', parameters: { charset: 'utf-8' } },
    { type: 'text', subtype: 'csv', parameters: { charset: 'utf8' } },
    { type: 'text', subtype: 'csv', parameters: { charset: 'ascii' } },
    { type: 'text', subtype: 'csv', parameters: {} },
  ],
};

/**
 * Creates the route which serves the sitemap.xml file. This file is intended to
 * update whenever a new page is added to the site, either directly by updating
 * this repository, or indirectly by using the admin panel to add new journeys
 * or courses.
 *
 * Currently, this completely regenerates the sitemap on every load, and serves
 * with a cache-control header of 1 hour, which will be respected by our
 * reverse-proxy. This means that invalidating the cache can be done by the
 * backend by fetching this route with cache-busting headers.
 */
export const constructSitemapRoute = (
  getFlatRoutes: () => Promise<RouteWithPrefix[]>
): PendingRoute[] => {
  const makeHandler = (format: 'xml' | 'plain') => async (cliArgs: CommandLineArgs) => {
    const acceptable = acceptableByFormat[format];
    const sitemapGetters: ((
      itgs: Itgs,
      pump: (entries: SitemapEntry[]) => CancelablePromise<void>
    ) => CancelablePromise<void>)[] = [];
    const rootFrontendUrl = process.env.ROOT_FRONTEND_URL;
    if (rootFrontendUrl === undefined) {
      throw new Error('ROOT_FRONTEND_URL must be set for the sitemap');
    }

    if (cliArgs.serve) {
      const flatRoutes = await getFlatRoutes();
      flatRoutes.forEach((route) => {
        const docs = Array.isArray(route.route.docs) ? route.route.docs : [route.route.docs];
        docs.forEach((doc) => {
          sitemapGetters.push((itgs, pump) => doc.getSitemapEntries(route.prefix, pump, itgs));
        });
      });
    }

    return simpleRouteHandler(async (args) => {
      const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
      if (coding === null) {
        return finishWithBadEncoding(args);
      }

      let accept: AcceptMediaRangeWithoutWeight | undefined;
      try {
        accept = selectAccept(parseAccept(args.req.headers['accept']), acceptable);
      } catch (e) {
        if (e instanceof Error && e.message === BAD_REQUEST_MESSAGE) {
          return finishWithBadRequest(args);
        }
        throw e;
      }

      if (accept === undefined) {
        return finishWithNotAcceptable(args, acceptable);
      }

      const charsetRaw = 'charset' in accept.parameters ? accept.parameters.charset : 'utf-8';
      if (!['utf-8', 'utf8', 'ascii'].includes(charsetRaw)) {
        return finishWithNotAcceptable(args, acceptable);
      }

      const charset = (charsetRaw === 'utf8' ? 'utf-8' : charsetRaw) as 'utf-8' | 'ascii';

      const cleanAccept = accept;
      await withItgs(async (itgs) => {
        let pumped: SitemapEntry[] | null | false = null;
        const pumpedTaken = new Callbacks<undefined>();
        const pumpedProvided = new Callbacks<undefined>();
        let sitemapClosed = false;
        const sitemapClosedCallbacks = new Callbacks<undefined>();

        const sitemap: StreamedSitemap = {
          entries: {
            read: () => {
              if (pumped !== null) {
                if (pumped === false) {
                  return { done: () => true, cancel: () => {}, promise: Promise.resolve(null) };
                }

                const result = pumped;
                pumped = null;
                pumpedTaken.call(undefined);
                return { done: () => true, cancel: () => {}, promise: Promise.resolve(result) };
              }

              return constructCancelablePromise({
                body: async (state, resolve, reject) => {
                  const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
                  const wasPumped = createCancelablePromiseFromCallbacks(pumpedProvided);
                  if (pumped !== null) {
                    state.finishing = true;
                    wasPumped.cancel();
                    canceled.cancel();

                    if (pumped === false) {
                      state.done = true;
                      resolve(null);
                    } else {
                      const result = pumped;
                      pumped = null;
                      pumpedTaken.call(undefined);
                      state.done = true;
                      resolve(result);
                    }
                    return;
                  }

                  await Promise.race([wasPumped.promise, canceled.promise]);
                  if (state.finishing) {
                    if (!state.done) {
                      state.done = true;
                      reject(new Error('canceled'));
                    }
                    return;
                  }

                  if (pumped === null) {
                    throw new Error('pumped should not be null after pumpedProvided');
                  }

                  if (pumped === false) {
                    state.finishing = true;
                    state.done = true;
                    resolve(null);
                    return;
                  }

                  state.finishing = true;
                  const result = pumped;
                  pumped = null;
                  pumpedTaken.call(undefined);
                  state.done = true;
                  resolve(result);
                },
              });
            },
            close: async () => {
              sitemapClosed = true;
              sitemapClosedCallbacks.call(undefined);
            },
          },
        };

        const pumpLoopPromise = (async () => {
          const pumper = (entries: SitemapEntry[] | false): CancelablePromise<void> =>
            constructCancelablePromise({
              body: async (state, resolve, reject) => {
                const canceled = createCancelablePromiseFromCallbacks(state.cancelers);
                if (state.finishing) {
                  state.done = true;
                  reject(new Error('canceled'));
                  return;
                }

                if (pumped === false) {
                  state.finishing = true;
                  state.done = true;
                  reject(new Error('pump() called after cancel() or done()'));
                  return;
                }

                if (pumped !== null) {
                  const readyToPump = createCancelablePromiseFromCallbacks(pumpedTaken);
                  if (pumped !== null) {
                    await Promise.race([readyToPump.promise, canceled.promise]);
                    if (state.finishing) {
                      state.done = true;
                      reject(new Error('canceled'));
                      return;
                    }
                  }

                  readyToPump.cancel();
                  if (pumped !== null) {
                    throw new Error('expected pumped to be null after pumpedTaken');
                  }
                }

                state.finishing = true;
                pumped = entries;
                pumpedProvided.call(undefined);
                state.done = true;
                resolve(undefined);
              },
            });

          const closed = createCancelablePromiseFromCallbacks(sitemapClosedCallbacks);
          if (sitemapClosed) {
            closed.cancel();
            return;
          }

          for (const getter of sitemapGetters) {
            const getterPromise = getter(itgs, pumper);
            await Promise.race([getterPromise.promise, closed.promise]);
            if (sitemapClosed) {
              getterPromise.cancel();
              break;
            }
          }

          if (!sitemapClosed) {
            const finalPumper = pumper(false);
            await Promise.race([finalPumper.promise, closed.promise]);
            finalPumper.cancel();
          }
          closed.cancel();
        })();

        const responseStream = createResponseStreamForSitemap(
          itgs,
          rootFrontendUrl,
          sitemap,
          format,
          charset
        );

        args.resp.statusCode = 200;
        args.resp.statusMessage = 'OK';
        args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
        args.resp.setHeader('Content-Encoding', coding);
        args.resp.setHeader(
          'Content-Type',
          `${cleanAccept.type}/${cleanAccept.subtype}; charset=${charset}`
        );
        await finishWithEncodedServerResponse(args, coding, responseStream);
        await pumpLoopPromise;
      });
    });
  };

  return [
    {
      methods: ['GET'],
      path: '/sitemap.xml',
      handler: makeHandler('xml'),
      docs: [],
    },
    {
      methods: ['GET'],
      path: '/sitemap.txt',
      handler: makeHandler('plain'),
      docs: [],
    },
  ];
};
