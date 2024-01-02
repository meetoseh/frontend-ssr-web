import { PendingRoute } from '../lib/route';
import { CommandLineArgs } from '../../CommandLineArgs';
import { sharedUnlockedClasses } from './routes/sharedUnlockedClasses';

const routes: (PendingRoute | ((args: CommandLineArgs) => Promise<PendingRoute[]>))[] = [
  sharedUnlockedClasses,
];

export default routes;
