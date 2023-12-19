import { CommandLineArgs } from '../../../CommandLineArgs';
import { CancelablePromise } from '../../../lib/CancelablePromise';
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
import { finishWithServiceUnavailable } from '../../lib/finishWithServiceUnavailable';
import { PendingRoute } from '../../lib/route';
import { simpleRouteHandler } from '../../lib/simpleRouteHandler';
import { RouteWithPrefix } from '../../openapi/routes/schema';
import { Sitemap, SitemapEntry } from '../lib/Sitemap';
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
    const sitemapGetters: (() => CancelablePromise<SitemapEntry[]>)[] = [];
    const rootFrontendUrl = process.env.ROOT_FRONTEND_URL;
    if (rootFrontendUrl === undefined) {
      throw new Error('ROOT_FRONTEND_URL must be set for the sitemap');
    }

    if (cliArgs.serve) {
      const flatRoutes = await getFlatRoutes();
      flatRoutes.forEach((route) => {
        const docs = Array.isArray(route.route.docs) ? route.route.docs : [route.route.docs];
        docs.forEach((doc) => {
          sitemapGetters.push(() => doc.getSitemapEntries(route.prefix));
        });
      });
    }

    return simpleRouteHandler(async (args) => {
      const coding = selectEncoding(parseAcceptEncoding(args.req.headers['accept-encoding']));
      if (coding === null) {
        return finishWithBadEncoding(args);
      }

      let accept;
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

      const sitemapEntries: SitemapEntry[] = [];
      for (const getter of sitemapGetters) {
        const cancelableGet = getter();
        if (args.state.finishing) {
          return finishWithServiceUnavailable(args, { retryAfterSeconds: 5 });
        }
        args.state.cancelers.add(cancelableGet.cancel);
        await Promise.race([args.canceled.promise, cancelableGet.promise]);
        if (args.state.finishing) {
          return finishWithServiceUnavailable(args, { retryAfterSeconds: 5 });
        }
        args.state.cancelers.remove(cancelableGet.cancel);

        sitemapEntries.push(...(await cancelableGet.promise));
      }

      const sitemap: Sitemap = { entries: sitemapEntries };
      const responseStream = createResponseStreamForSitemap(
        rootFrontendUrl,
        sitemap,
        format,
        charset
      );

      args.resp.statusCode = 200;
      args.resp.statusMessage = 'OK';
      args.resp.setHeader('Vary', STANDARD_VARY_RESPONSE);
      args.resp.setHeader('Content-Encoding', coding);
      args.resp.setHeader('Content-Type', `${accept.type}/${accept.subtype}; charset=${charset}`);
      return finishWithEncodedServerResponse(args, coding, responseStream);
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
