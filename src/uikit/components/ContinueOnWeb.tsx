import { sendPlausibleEvent } from '../lib/sendPlausibleEvent';
import { Button } from './Button';

const rootFrontendUrl = (process.env.CLIENT_VISIBLE_ROOT_FRONTEND_URL ??
  process.env.ROOT_FRONTEND_URL)!;

/**
 * The primary call to action to try the app on web
 */
export const ContinueOnWeb = ({ tracking }: { tracking: boolean }) => {
  return (
    <Button
      type="button"
      variant="filled-white"
      onClick={rootFrontendUrl}
      onLinkClick={() => {
        if (!tracking) {
          return;
        }

        sendPlausibleEvent('click--frontend-ssr-web/uikit/ContinueOnWeb', {
          name: 'frontend-ssr-web/uikit/ContinueOnWeb--click',
          props: {
            provider: 'browser',
          },
        });
      }}>
      Continue on Web
    </Button>
  );
};
