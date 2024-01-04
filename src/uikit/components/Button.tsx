import { AnchorHTMLAttributes, PropsWithChildren, ReactElement, useEffect, useRef } from 'react';
import styles from './Button.module.css';
import { combineClasses } from '../lib/combineClasses';
import { InlineOsehSpinner } from '../components/InlineOsehSpinner';

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
    | 'outlined'
    | 'outlined-white'
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
  fullWidth = false,
  variant = 'filled',
  disabled = false,
  spinner = false,
  onClick = undefined,
  onLinkClick = undefined,
  onMouseEnter = undefined,
  download = undefined,
}: PropsWithChildren<ButtonProps>): ReactElement => {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (
      anchorRef.current === null ||
      anchorRef.current === undefined ||
      onLinkClick === undefined
    ) {
      return;
    }
    const anchor = anchorRef.current;
    anchor.addEventListener('click', onLinkClick, false);
    return () => {
      anchor.removeEventListener('click', onLinkClick, false);
    };
  }, [onLinkClick]);

  if (typeof onClick !== 'string') {
    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
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
      ref={anchorRef}
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
          outlined: 'white',
          'outlined-white': 'white',
          link: 'white',
          'link-small': 'white',
          'link-white': 'white',
          'link-small-upper': 'white',
        }[variant] as 'white' | 'black'
      }
    />
  </div>
);
