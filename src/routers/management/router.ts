import { PendingRoute } from '../lib/route';
import { exampleRoute, exampleRouteBundle } from './routes/example';
import helloWorldRoute from './routes/hello_world';

const routes: PendingRoute[] = [exampleRoute, exampleRouteBundle, helloWorldRoute];

export default routes;
