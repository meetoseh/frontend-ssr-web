import { ReactElement } from 'react';
import styles from './Footer.module.css';
import { DownloadAppLinks } from '../DownloadAppLinks';
import { Socials } from '../Socials';
import { useWindowSizeValueWithCallbacks } from '../../hooks/useWindowSize';
import { VariableStrategyProps } from '../../anim/VariableStrategyProps';
import { Brandmark } from './Brandmark';
import { Wordmark } from './Wordmark';

export const Footer = (): ReactElement => {
  const windowSizeVWC = useWindowSizeValueWithCallbacks();
  const justifyVSP: VariableStrategyProps<'center' | 'flex-start' | 'flex-end'> = {
    type: 'callbacks',
    props: () => {
      const size = windowSizeVWC.get();
      if (size === null) {
        return 'flex-start';
      }
      return size.width < 450 ? 'flex-start' : 'flex-end';
    },
    callbacks: windowSizeVWC.callbacks,
  };

  return (
    <div className={styles.container}>
      <div className={styles.nav}>
        <a href="https://oseh.com">Home</a>
        <a href="https://oseh.com/guides">Guides</a>
        <a href="https://oseh.com/about">About</a>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <div className={styles.brandmark}>
              <Brandmark size={{ height: 24 }} color="white" />
            </div>

            <div className={styles.wordmark}>
              <Wordmark size={{ height: 24 }} color="white" />
            </div>
          </div>
          <div className={styles.tag}>Mindfulness made easy</div>
        </div>
      </div>
      <div className={styles.related}>
        <div className={styles.appLinks}>
          <DownloadAppLinks tracking justify={justifyVSP} />
        </div>
        <div className={styles.socials}>
          <Socials />
        </div>
        <div className={styles.legal}>
          <div className={styles.copyright}>© Oseh 2024</div>
          <a href="https://www.oseh.com/privacy" className={styles.legalLink}>
            Privacy Policy
          </a>
          <a href="https://www.oseh.com/terms" className={styles.legalLink}>
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
};
