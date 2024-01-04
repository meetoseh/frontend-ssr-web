import { ReactElement } from 'react';
import styles from './Callout.module.css';

/**
 * Shows a big callout with the value of joining Oseh
 */
export const Callout = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>
        Access hundreds of minute-long mindfulness classes for free
      </div>
      <div className={styles.subtitle}>No credit card required</div>
    </div>
  );
};
