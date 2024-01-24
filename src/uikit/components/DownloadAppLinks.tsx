import { ReactElement, useEffect, useRef } from 'react';
import styles from './DownloadAppLinks.module.css';
import assistiveStyles from '../styles/assistive.module.css';
import { Callbacks } from '../lib/Callbacks';
import { sendPlausibleEvent } from '../lib/sendPlausibleEvent';

/**
 * Shows two horizontal badges for downloading on the app store or
 * google play
 */
export const DownloadAppLinks = ({
  tracking,
}: {
  /**
   * True to trigger frontend-ssr-web/uikit/DownloadAppLinks--click when one of
   * the links is clicked, false otherwise
   */
  tracking: boolean;
}): ReactElement => {
  const appleRef = useRef<HTMLAnchorElement>(null);
  const googleRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!tracking) {
      return;
    }

    let running = true;
    const cancelers = new Callbacks<undefined>();
    if (appleRef.current !== null) {
      injectTracking(appleRef.current, 'AppleAppStore', cancelers);
    }
    if (googleRef.current !== null) {
      injectTracking(googleRef.current, 'GooglePlay', cancelers);
    }
    return () => {
      running = false;
      cancelers.call(undefined);
    };

    function injectTracking(
      anchor: HTMLAnchorElement,
      provider: string,
      cancelers: Callbacks<undefined>
    ) {
      if (!running) {
        return;
      }

      anchor.addEventListener('click', onClick, false);
      cancelers.add(() => {
        anchor.removeEventListener('click', onClick, false);
      });

      function onClick() {
        sendPlausibleEvent('click--frontend-ssr-web/uikit/DownloadAppLinks', {
          name: 'frontend-ssr-web/uikit/DownloadAppLinks--click',
          props: {
            provider,
          },
        });
      }
    }
  }, [tracking]);

  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <a
          className={styles.iconAnchor}
          href="https://apps.apple.com/us/app/oseh-mindfulness-made-easy/id6453520882"
          ref={appleRef}>
          <div className={styles.iconApple} />
          <div className={assistiveStyles.srOnly}>Download on the App Store</div>
        </a>
      </div>
      <div className={styles.item}>
        <a
          className={styles.iconAnchor}
          href="https://play.google.com/store/apps/details?id=com.oseh.frontendapp"
          ref={googleRef}>
          <div className={styles.iconGoogle} />
          <div className={assistiveStyles.srOnly}>Get it on Google Play</div>
        </a>
      </div>
    </div>
  );
};
