import { ReactElement, useMemo } from 'react';
import styles from './ProvidersList.module.css';
import { OauthProvider } from '../lib/OauthProvider';
import { ButtonWithIcon, ButtonsWithIconsColumn } from './ButtonsWithIconsColumn';
import { sendPlausibleEvent } from '../lib/sendPlausibleEvent';
import { Button } from './Button';

/**
 * An item within a providers list, which is analogous to an item within
 * a ButtonsWithIconsColumn, but the name and icon can be inferred from
 * the provider.
 */
export type ProvidersListItem = {
  /**
   * The provider to use for this item.
   */
  provider: OauthProvider;

  /**
   * True if we inject standard plausible tracking into the appropriate handler.
   * This will cause the `frontend-ssr-web/uikit/ProvidersList--click` event to
   * be sent when the button is clicked.
   */
  tracking: boolean;

  /**
   * Either the function to call when the button is clicked, or a string
   * for the href of an anchor tag. Generally a string should be used if
   * the user will be immediately redirected, whereas a function is used
   * if a modal will be displayed first
   */
  onClick: string | (() => void);

  /**
   * Ignored unless onClick is a string. If onClick is a string,
   * this is called on a best-effort basis when the link is clicked
   * but before the user is redirected. Note that the user may be
   * redirected at any point, so this generally has just enough time
   * to send a beacon or cleanup local storage, but not enough time
   * to e.g. wait for a response on a network request
   */
  onLinkClick?: () => void;
};

export type ProvidersListProps = {
  /**
   * The buttons to be rendered in the column
   */
  items: ProvidersListItem[];
};

const secondaryNames = {
  Google: 'Google',
  SignInWithApple: 'Apple',
  Direct: 'Email',
  Dev: 'Dev',
} as const;

/**
 * Displays a list of providers using the standard spacing and button
 * variant.
 */
export const ProvidersList = ({ items }: ProvidersListProps): ReactElement => {
  const buttons = useMemo(
    () =>
      items.map(({ provider, tracking, onClick, onLinkClick }): ButtonWithIcon => {
        const track = () =>
          sendPlausibleEvent('click--frontend-ssr-web/uikit/ProvidersList', {
            name: 'frontend-ssr-web/uikit/ProvidersList--click',
            props: {
              provider,
            },
          });

        const injectedOnClick =
          typeof onClick === 'string' || !tracking
            ? onClick
            : () => {
                track();
                onClick();
              };

        const injectedOnLinkClick =
          typeof onClick !== 'string' || !tracking
            ? onLinkClick
            : () => {
                track();
                onLinkClick?.();
              };

        return {
          key: provider,
          icon: <span className={styles['icon' + provider]} />,
          name: {
            Google: 'Sign Up with Google',
            SignInWithApple: 'Sign Up with Apple',
            Direct: 'Sign Up with Email',
            Dev: 'Sign Up with Dev',
          }[provider],
          onClick: injectedOnClick,
          onLinkClick: injectedOnLinkClick,
        };
      }),
    [items]
  );

  if (items.length === 3) {
    return (
      <div className={styles.three}>
        <div className={styles.primary}>
          <Button
            type="button"
            variant="filled-white"
            onClick={buttons[0].onClick}
            onLinkClick={buttons[0].onLinkClick}>
            <div className={styles.threeContent}>
              <div className={styles.threeIcon}>{buttons[0].icon}</div>
              <div className={styles.threeText}>{buttons[0].name}</div>
            </div>
          </Button>
        </div>
        <div className={styles.secondaries}>
          <Button
            type="button"
            variant="outlined-white-thin"
            onClick={buttons[1].onClick}
            onLinkClick={buttons[1].onLinkClick}>
            <div className={styles.threeContent}>
              <div className={styles.threeIcon}>{buttons[1].icon}</div>
              <div className={styles.threeText}>{secondaryNames[items[1].provider]}</div>
            </div>
          </Button>
          <Button
            type="button"
            variant="outlined-white-thin"
            onClick={buttons[2].onClick}
            onLinkClick={buttons[2].onLinkClick}>
            <div className={styles.threeContent}>
              <div className={styles.threeIcon}>{buttons[2].icon}</div>
              <div className={styles.threeText}>{secondaryNames[items[2].provider]}</div>
            </div>
          </Button>
        </div>
      </div>
    );
  }

  return <ButtonsWithIconsColumn items={buttons} variant="filled-white" gap={20} />;
};
