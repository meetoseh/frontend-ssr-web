import { ReactElement, useCallback } from 'react';
import { Modals, addModalWithCallbackToRemove } from '../contexts/ModalContext';
import { WritableValueWithCallbacks } from '../lib/Callbacks';
import { useValueWithCallbacksEffect } from './useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { ModalWrapper } from '../components/ModalWrapper';
import styles from './useErrorModal.module.css';

/**
 * When an error is set, shows a modal which can be dismissed containing the
 * error element.
 *
 * @param modals The modals to use to show the error
 * @param error The error to show. We clear the error if dismissed by the user.
 * @param context Used to distinguish where this error is coming from
 */
export const useErrorModal = (
  modals: WritableValueWithCallbacks<Modals>,
  errorVWC: WritableValueWithCallbacks<ReactElement | null>,
  location: string
) => {
  useValueWithCallbacksEffect(
    errorVWC,
    useCallback(
      (error) => {
        if (error === null) {
          return undefined;
        }

        return addModalWithCallbackToRemove(
          modals,
          <ModalWrapper onClosed={() => setVWC(errorVWC, null)}>
            <div className={styles.title}>An error occurred</div>
            <div className={styles.subtitle}>{location}</div>
            <div className={styles.error}>{error}</div>
          </ModalWrapper>
        );
      },
      [modals, location, errorVWC]
    )
  );
};
