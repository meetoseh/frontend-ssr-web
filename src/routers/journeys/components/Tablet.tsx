import { ReactElement } from 'react';
import styles from './Tablet.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { ValueProps } from './ValueProps';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { Callout } from './Callout';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';
import { LoginOptionsSeparator } from '../../../uikit/components/LoginOptionsSeparator';
import { ProvidersList } from '../../../uikit/components/ProvidersList';
import { Player } from './Player';

/**
 * Manages the contents seen on tablet or wider screens
 */
export const Tablet = (props: SharedUnlockedClassBodyDelegateProps): ReactElement => {
  return (
    <>
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
        <div className={styles.downloadContainer}>
          <DownloadAppLinks />
        </div>
        <div className={styles.loginOptionsSeparatorContainer}>
          <LoginOptionsSeparator />
        </div>
        <div className={styles.providerListContainer}>
          <RenderGuardedComponent
            props={props.signInUrls}
            component={(signInUrls) => <ProvidersList items={signInUrls} />}
          />
        </div>
      </div>
    </>
  );
};
