import { ReactElement } from 'react';
import styles from './ValueProps.module.css';

export const ValueProps = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <div className={styles.iconShort} />
        <div className={styles.text}>Bite-sized content from 1-5 minutes</div>
      </div>
      <div className={styles.item}>
        <div className={styles.iconExperts} />
        <div className={styles.text}>
          100s of classes to reduce anxiety, sleep better and manage panic attacks
        </div>
      </div>
      <div className={styles.item}>
        <div className={styles.iconGoals} />
        <div className={styles.text}>Set goals and track your progress</div>
      </div>
    </div>
  );
};
