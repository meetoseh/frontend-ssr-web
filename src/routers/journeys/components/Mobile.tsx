import { ReactElement } from 'react';
import styles from './Mobile.module.css';
import assistiveStyles from '../../../uikit/styles/assistive.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { Player } from './Player';
import { ValueProps } from './ValueProps';
import { Callout } from './Callout';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';
import { ContinueOnWeb } from '../../../uikit/components/ContinueOnWeb';

/**
 * Manages the contents seen on less-than-tablet-sized screens
 */
export const Mobile = (props: SharedUnlockedClassBodyDelegateProps): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <a className={styles.wordmark} href="https://oseh.com">
          <div className={styles.iconWordmark} />
          <div className={assistiveStyles.srOnly}>Oseh</div>
        </a>
      </div>
      <div className={styles.calloutContainer}>
        <Callout />
      </div>
      <div className={styles.providerListContainer}>
        <ContinueOnWeb tracking />
      </div>
      <div className={styles.player}>
        <Player {...props} />
      </div>
      <div className={styles.valuePropsContainer}>
        <ValueProps />
      </div>
      {/* <div className={styles.loginOptionsSeparatorContainer}>
        <LoginOptionsSeparator />
      </div> */}
      <div className={styles.downloadContainer}>
        <DownloadAppLinks tracking />
      </div>
    </div>
  );
};
