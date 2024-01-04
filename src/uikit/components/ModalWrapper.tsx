import { PropsWithChildren, ReactElement } from 'react';
import styles from './modals.module.css';

type ModalProps = {
  /**
   * Called when the user clicks outside the modal
   */
  onClosed: () => void;

  /**
   * If true, the modal will not have any padding or border radius. Helpful
   * if you want to style that part yourself, or set a background color.
   * Default false.
   */
  minimalStyling?: boolean | undefined;
};

/**
 * Wraps the children in the standard modal wrapper. This is typically used
 * when injecting into the modal context.
 *
 * @see SlideInModal for an alternative wrapper which slides up from the bottom
 */
export const ModalWrapper = ({
  children,
  onClosed,
  minimalStyling = undefined,
}: PropsWithChildren<ModalProps>): ReactElement => {
  if (minimalStyling === undefined) {
    minimalStyling = false;
  }

  return (
    <div
      className={`${styles.container} ${minimalStyling ? styles.minimal : styles.normal}`}
      onClick={(e) => {
        e.stopPropagation();
        onClosed();
      }}>
      <div
        className={styles.innerContainer}
        onClick={(e) => {
          e.stopPropagation();
        }}>
        {children}
      </div>
    </div>
  );
};
