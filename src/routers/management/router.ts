import { CommandLineArgs } from '../../CommandLineArgs';
import { PendingRoute } from '../lib/route';
import exampleRoutes from './routes/example';
import helloWorldRoute from './routes/hello_world';

const routes: (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[] = [
  exampleRoutes,
  helloWorldRoute,
];

export default routes;
