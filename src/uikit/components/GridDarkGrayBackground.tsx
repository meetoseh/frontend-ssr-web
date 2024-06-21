import { ReactElement } from 'react';
import styles from './GridDarkGrayBackground.module.css';

/**
 * An element which fills the background using grid-area: 1 / 1 / -1 / -1
 * and has the standard dark gray gradient background.
 */
export const GridDarkGrayBackground = (): ReactElement => <div className={styles.container} />;
