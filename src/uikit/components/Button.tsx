import { AnchorHTMLAttributes, PropsWithChildren, ReactElement, useCallback } from 'react';
import styles from './Button.module.css';
import { combineClasses } from '../lib/combineClasses';
import { InlineOsehSpinner } from '../components/InlineOsehSpinner';
import { WritableValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { useMappedValuesWithCallbacks } from '../hooks/useMappedValuesWithCallbacks';

export type ButtonProps = {
  /**
   * The type of button
   */
  type: 'button' | 'submit';

  /**
   * True for the button to fill the width of the container,
   * false for a reasonable default width
   * @default false
   */
  fullWidth?: boolean;

  /**
   * The variant of the button
   * @default 'filled'
   */
  variant?:
    | 'filled'
    | 'filled-white'
    | 'filled-premium'
    | 'outlined'
    | 'outlined-white'
    | 'outlined-white-thin'
    | 'link'
    | 'link-small'
    | 'link-white'
    | 'link-small-upper';

  /**
   * If the button is disabled
   */
  disabled?: boolean;

  /**
   * Called when the button is clicked. Can be a string to be treated as a url
   */
  onClick?: React.MouseEventHandler<HTMLButtonElement> | string | undefined;

  /**
   * Ignored unless onClick is a string. Called when the link is clicked,
   * when the user is already being navigated to the link
   */
  onLinkClick?: ((this: HTMLAnchorElement, ev: MouseEvent) => void) | undefined;

  /**
   * Called when the mouse enters the button. Only called on desktop, so
   * should not be used for essential functionality
   */
  onMouseEnter?: (() => void) | undefined;

  /**
   * If set, used to make the anchor tag download the file. Ignored if not
   * an anchor tag
   */
  download?: AnchorHTMLAttributes<HTMLAnchorElement>['download'];

  /**
   * If true, a spinner is displayed on the button before the text
   */
  spinner?: boolean;
};

/**
 * The standard oseh button
 */
export const Button = ({
  type,
  children,
  refVWC = undefined,
  fullWidth = false,
  variant = 'filled',
  disabled = false,
  spinner = false,
  onClick = undefined,
  onLinkClick = undefined,
  onMouseEnter = undefined,
  download = undefined,
}: PropsWithChildren<ButtonProps> & {
  refVWC?:
    | WritableValueWithCallbacks<HTMLButtonElement | HTMLAnchorElement | null>
    | WritableValueWithCallbacks<HTMLElement | null>;
}): ReactElement => {
  const buttonVWC = useWritableValueWithCallbacks<HTMLButtonElement | null>(() => null);
  const anchorVWC = useWritableValueWithCallbacks<HTMLAnchorElement | null>(() => null);
  const realRefVWC = useMappedValuesWithCallbacks(
    [buttonVWC, anchorVWC],
    () => buttonVWC.get() ?? anchorVWC.get() ?? null
  );

  useValueWithCallbacksEffect(
    realRefVWC,
    useCallback(
      (r) => {
        if (refVWC !== undefined) {
          setVWC(refVWC as any, r);
        }
        return undefined;
      },
      [refVWC]
    )
  );

  useValueWithCallbacksEffect(
    anchorVWC,
    useCallback(
      (anchorRef) => {
        if (anchorRef === null || anchorRef === undefined || onLinkClick === undefined) {
          return;
        }
        const anchor = anchorRef;
        anchor.addEventListener('click', onLinkClick, false);
        return () => {
          anchor.removeEventListener('click', onLinkClick, false);
        };
      },
      [onLinkClick]
    )
  );

  if (typeof onClick !== 'string') {
    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        ref={(r) => setVWC(buttonVWC, r)}
        className={combineClasses(
          styles.button,
          styles[variant],
          fullWidth ? styles.fullWidth : undefined,
          spinner ? styles.buttonWithSpinner : undefined
        )}>
        {spinner && <ButtonSpinner variant={variant} />}
        <div className={styles.childrenContainer}>{children}</div>
      </button>
    );
  }

  return (
    <a
      ref={(r) => setVWC(anchorVWC, r)}
      type={type}
      href={onClick}
      onMouseEnter={onMouseEnter}
      className={combineClasses(
        styles.button,
        styles[variant],
        fullWidth ? styles.fullWidth : undefined,
        spinner ? styles.buttonWithSpinner : undefined
      )}
      download={download}>
      {spinner && <ButtonSpinner variant={variant} />}
      <div className={styles.childrenContainer}>{children}</div>
    </a>
  );
};

const ButtonSpinner = ({
  variant,
}: {
  variant: Required<ButtonProps>['variant'];
}): ReactElement => (
  <div className={styles.spinnerContainer}>
    <InlineOsehSpinner
      size={{
        type: 'react-rerender',
        props: { height: 24 },
      }}
      variant={
        {
          filled: 'black',
          'filled-white': 'black',
          'filled-premium': 'white',
          outlined: 'white',
          'outlined-white': 'white',
          'outlined-white-thin': 'white',
          link: 'white',
          'link-small': 'white',
          'link-white': 'white',
          'link-small-upper': 'white',
        }[variant] as 'white' | 'black'
      }
    />
  </div>
);
