import { ReactElement, useEffect } from 'react';
import { useWritableValueWithCallbacks } from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import styles from './ButtonsWithIconsColumn.module.css';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { Button, ButtonProps } from './Button';

/**
 * Describes the contents of a button with an icon followed by
 * some simple text, which is rerendered based on the given
 * key.
 */
export type ButtonWithIcon = {
  /**
   * The key for rerendering the button
   */
  key: string;
  /**
   * The element which will be rendered as the icon. This is
   * assumed to be a single div/span and already padded or
   * margined with the appropriate spacing between it and the
   * text
   */
  icon: ReactElement;
  /**
   * The text to be rendered after the icon
   */
  name: string;
  /**
   * The callback to be called when the button is clicked,
   * or a string to be used as the href for an anchor tag
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

export type ButtonsWithIconsColumnProps = {
  /**
   * The buttons to be rendered in the column
   */
  items: ButtonWithIcon[];

  /**
   * The button variant to use for all of the buttons
   */
  variant: ButtonProps['variant'];

  /**
   * The gap between consecutive items, in pixels
   */
  gap: number;
};

/**
 * Renders a column of buttons, where each button is a full-width button
 * containing an icon followed by some text.
 *
 * This follows a special layout rule, which is more visually satisfying
 * given the icons act as a visual anchor:
 * - The width of all the icons must be the same
 * - The width of the text may differ between buttons
 * - The space between the icon and text is fixed
 * - All icons are at the same x-offset relative to the left of the button
 * - For the button with the longest text, the content is centered
 *
 * For example:
 *
 * |     [icon] short         |  <-- this is anchored by the middle button
 * |     [icon] long text     |  <-- this is centered
 * |     [icon] medium        |  <-- this is anchored by the middle button
 *
 * This can't be represented by standard CSS as far as I know. It looks best
 */
export const ButtonsWithIconsColumn = ({
  items,
  variant,
  gap,
}: ButtonsWithIconsColumnProps): ReactElement => {
  // following immutable semantics
  const refsVWC = useWritableValueWithCallbacks<Map<string, HTMLDivElement>>(() => new Map());

  /* cleanup keys in refs which are no longer in items */
  useEffect(() => {
    const refs = refsVWC.get();
    if (refs.size === 0) {
      return;
    }

    const goodKeys = new Set<string>();
    for (const item of items) {
      if (goodKeys.has(item.key)) {
        throw new Error(`Duplicate key ${item.key}`);
      }
      goodKeys.add(item.key);
    }

    let foundBadKey = false;
    const iter = refs.keys();
    let next = iter.next();
    while (!next.done) {
      if (!goodKeys.has(next.value)) {
        foundBadKey = true;
        break;
      }
      next = iter.next();
    }

    if (foundBadKey) {
      const newRefs = new Map();
      for (const item of items) {
        const ref = refs.get(item.key);
        if (ref !== undefined) {
          newRefs.set(item.key, ref);
        }
      }
      setVWC(refsVWC, newRefs);
    }
  }, [items, refsVWC]);

  /* fix the paddings on the text elements; on the web, this can be done synchronously */
  useValueWithCallbacksEffect(refsVWC, (refs) => {
    for (const item of items) {
      const ref = refs.get(item.key);
      if (ref === undefined) {
        return;
      }

      ref.removeAttribute('style');
    }

    // we will trigger a reflow on offsetWidth, hence we
    // unset all the styles first so we only get one reflow,
    // then we're careful to keep the offset widths we measured
    // to avoid triggering reflows while adding styles

    let maxWidth = 0;
    let offsetWidthsByKey: Record<string, number> = {};
    for (const item of items) {
      const ref = refs.get(item.key) as HTMLDivElement;
      const width = ref.offsetWidth;
      maxWidth = Math.max(maxWidth, width);
      offsetWidthsByKey[item.key] = width;
    }

    for (const item of items) {
      const ref = refs.get(item.key) as HTMLDivElement;
      ref.style.paddingRight = `${maxWidth - offsetWidthsByKey[item.key]}px`;
    }
    return undefined;
  });

  return (
    <div className={styles.container} style={{ gap: `${gap}px` }}>
      {items.map((item) => {
        const onClick = item.onClick;
        return (
          <Button
            key={item.key}
            type="button"
            variant={variant}
            onClick={
              typeof onClick === 'string'
                ? onClick
                : (e) => {
                    e.preventDefault();
                    onClick();
                  }
            }
            onLinkClick={item.onLinkClick}
            fullWidth>
            <div className={styles.itemContents}>
              {item.icon}
              <div
                className={styles.itemText}
                ref={(r) => {
                  if (r === null) {
                    if (refsVWC.get().has(item.key)) {
                      const cpRefs = new Map(refsVWC.get());
                      cpRefs.delete(item.key);
                      setVWC(refsVWC, cpRefs);
                    }
                  } else {
                    const cpRefs = new Map(refsVWC.get());
                    cpRefs.set(item.key, r);
                    setVWC(refsVWC, cpRefs);
                  }
                }}>
                {item.name}
              </div>
            </div>
          </Button>
        );
      })}
    </div>
  );
};
