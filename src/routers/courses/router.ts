import { PendingRoute } from '../lib/route';
import { CommandLineArgs } from '../../CommandLineArgs';
import { coursePublicPages } from './routes/coursePublicPages';

const routes: Record<
  string,
  (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[]
> = {
  '/shared/series': [coursePublicPages],
};

export default routes;
