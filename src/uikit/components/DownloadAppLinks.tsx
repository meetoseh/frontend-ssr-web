import { ReactElement } from 'react';
import styles from './DownloadAppLinks.module.css';
import assistiveStyles from '../styles/assistive.module.css';

/**
 * Shows two horizontal badges for downloading on the app store or
 * google play
 */
export const DownloadAppLinks = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <a
          className={styles.iconAnchor}
          href="https://apps.apple.com/us/app/oseh-mindfulness-made-easy">
          <div className={styles.iconApple} />
          <div className={assistiveStyles.srOnly}>Download on the App Store</div>
        </a>
      </div>
      <div className={styles.item}>
        <a
          className={styles.iconAnchor}
          href="https://play.google.com/store/apps/details?id=com.oseh.frontendapp">
          <div className={styles.iconGoogle} />
          <div className={assistiveStyles.srOnly}>Get it on Google Play</div>
        </a>
      </div>
    </div>
  );
};
