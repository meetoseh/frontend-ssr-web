import { ReactElement } from 'react';
import styles from './Tablet.module.css';
import assistiveStyles from '../../../uikit/styles/assistive.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { ValueProps } from './ValueProps';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { Callout } from './Callout';
import { ProvidersList } from '../../../uikit/components/ProvidersList';
import { Player } from './Player';

/**
 * Manages the contents seen on tablet or wider screens
 */
export const Tablet = (props: SharedUnlockedClassBodyDelegateProps): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <a className={styles.wordmark} href="https://oseh.com">
          <div className={styles.iconWordmark} />
          <div className={assistiveStyles.srOnly}>Oseh</div>
        </a>
      </div>
      <div className={styles.content}>
        <div className={styles.leftColumn}>
          <Player {...props} placeholderWidth="375px" placeholderHeight="667px" />
        </div>
        <div className={styles.rightColumn}>
          <div className={styles.valuePropsContainer}>
            <ValueProps />
          </div>
          <div className={styles.calloutContainer}>
            <Callout />
          </div>
          {/* <div className={styles.downloadContainer}>
            <DownloadAppLinks tracking />
          </div>
          <div className={styles.loginOptionsSeparatorContainer}>
            <LoginOptionsSeparator />
          </div> */}
          <div className={styles.providerListContainer}>
            <RenderGuardedComponent
              props={props.signInUrls}
              component={(signInUrls) => <ProvidersList items={signInUrls} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
