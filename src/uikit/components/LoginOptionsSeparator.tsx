import { ReactElement } from 'react';
import styles from './LoginOptionsSeparator.module.css';

/**
 * Shows a horizontal line with "OR" in the middle
 */
export const LoginOptionsSeparator = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.line} />
      <div className={styles.text}>OR</div>
      <div className={styles.line} />
    </div>
  );
};
