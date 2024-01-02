import { CommandLineArgs } from '../CommandLineArgs';
import { PendingRoute } from './lib/route';
import managementRoutes from './management/router';
import docsRoute from './openapi/routes/docs';
import journeyRoutes from './journeys/router';

const routes: {
  [prefix: string]: (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[];
} = {};
routes['/management'] = managementRoutes;
routes[''] = [docsRoute, ...journeyRoutes];

export default routes;
