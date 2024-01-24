import { PendingRoute } from '../lib/route';
import { CommandLineArgs } from '../../CommandLineArgs';
import { sharedUnlockedClasses } from './routes/sharedUnlockedClasses';
import { shareLink } from './routes/shareLink';

const routes: Record<
  string,
  (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[]
> = {
  '/shared': [sharedUnlockedClasses],
  '/s': [shareLink],
};

export default routes;
