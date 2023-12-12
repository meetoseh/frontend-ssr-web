import { PendingRoute } from '../../lib/route';
import { staticRouteHandler } from '../../lib/staticRouteHandler';

const docsRoute: PendingRoute = {
  methods: ['GET'],
  path: '/docs',
  handler: () =>
    staticRouteHandler('static/docs.html', {
      contentType: 'text/html; charset=utf-8',
    }),
  docs: [],
};

export default docsRoute;
