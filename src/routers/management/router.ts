import { PendingRoute } from '../lib/route';
import exampleRoutes from './routes/example';
import helloWorldRoute from './routes/hello_world';

const routes: PendingRoute[] = [...exampleRoutes, helloWorldRoute];

export default routes;
