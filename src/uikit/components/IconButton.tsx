import { MouseEventHandler, ReactElement } from 'react';
import styles from './IconButton.module.css';
import assistiveStyles from '../styles/assistive.module.css';
import { combineClasses } from '../lib/combineClasses';

type IconButtonProps = {
  /**
   * The class which, when applied to an element, renders the icon
   */
  icon: string;

  /**
   * The name for screen readers
   */
  srOnlyName: string;

  /**
   * The click handler, or a string to use an anchor tag instead
   */
  onClick: MouseEventHandler<HTMLButtonElement> | string;

  /**
   * If the button should be disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * If the button should be spinning
   * @default false
   */
  spinning?: boolean;
};

export const IconButton = ({
  icon,
  srOnlyName,
  onClick,
  disabled = false,
  spinning = false,
}: IconButtonProps): ReactElement => {
  if (typeof onClick === 'string') {
    return (
      <a href={onClick} className={styles.button}>
        <div
          className={combineClasses(icon, spinning ? styles.spinning : undefined)}
          aria-hidden="true"
        />
        <span className={assistiveStyles.srOnly}>{srOnlyName}</span>
      </a>
    );
  } else {
    return (
      <button type="button" onClick={onClick} className={styles.button} disabled={disabled}>
        <div
          className={combineClasses(icon, spinning ? styles.spinning : undefined)}
          aria-hidden="true"
        />
        <span className={assistiveStyles.srOnly}>{srOnlyName}</span>
      </button>
    );
  }
};
