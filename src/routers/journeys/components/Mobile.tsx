import { ReactElement } from 'react';
import styles from './Mobile.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { Player } from './Player';
import { ValueProps } from './ValueProps';
import { Callout } from './Callout';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';
import { LoginOptionsSeparator } from '../../../uikit/components/LoginOptionsSeparator';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { ProvidersList } from '../../../uikit/components/ProvidersList';

/**
 * Manages the contents seen on less-than-tablet-sized screens
 */
export const Mobile = (props: SharedUnlockedClassBodyDelegateProps): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.player}>
        <Player {...props} placeholderWidth="100%" placeholderHeight="100%" />
      </div>
      <div className={styles.valuePropsContainer}>
        <ValueProps />
      </div>
      <div className={styles.calloutContainer}>
        <Callout />
      </div>
      <div className={styles.downloadContainer}>
        <DownloadAppLinks tracking />
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
  );
};
