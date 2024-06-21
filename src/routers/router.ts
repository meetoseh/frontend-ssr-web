import { CommandLineArgs } from '../CommandLineArgs';
import { PendingRoute } from './lib/route';
import managementRoutes from './management/router';
import docsRoute from './openapi/routes/docs';
import journeyRoutes from './journeys/router';
import courseRoutes from './courses/router';
import iabRoutes from './inapp_browser/router';

const routes: {
  [prefix: string]: (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[];
} = {};
routes['/shared/management'] = managementRoutes;
routes['/shared'] = [docsRoute];

for (const fancyRoutes of [journeyRoutes, courseRoutes, iabRoutes]) {
  for (const [pfx, subroutes] of Object.entries(fancyRoutes)) {
    if (pfx in routes) {
      routes[pfx].push(...subroutes);
    } else {
      routes[pfx] = subroutes;
    }
  }
}

export default routes;
