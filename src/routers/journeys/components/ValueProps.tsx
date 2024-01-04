import { ReactElement } from 'react';
import styles from './ValueProps.module.css';

export const ValueProps = (): ReactElement => {
  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <div className={styles.iconShort} />
        <div className={styles.text}>Short classes you can fit in anytime, anywhere</div>
      </div>
      <div className={styles.item}>
        <div className={styles.iconExperts} />
        <div className={styles.text}>Learn from expert mindfulness instructors</div>
      </div>
      <div className={styles.item}>
        <div className={styles.iconGoals} />
        <div className={styles.text}>Set goals and track your progress</div>
      </div>
    </div>
  );
};
