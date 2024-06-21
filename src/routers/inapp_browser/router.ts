import { PendingRoute } from '../lib/route';
import { CommandLineArgs } from '../../CommandLineArgs';
import { iabCatchall } from './routes/catchall';

const routes: Record<
  string,
  (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[]
> = {
  '/iab': [iabCatchall],
};

export default routes;
