import { ReactElement } from 'react';
import styles from './Callout.module.css';

/**
 * Shows a big callout with the value of joining Oseh
 */
export const Callout = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Reduce anxiety, reclaim your calm</div>
      <div className={styles.subtitle}>Free, no credit card required</div>
    </div>
  );
};
