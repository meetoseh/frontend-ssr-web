import { ReactElement, useEffect } from 'react';
import styles from './Tablet.module.css';
import { SharedUnlockedClassBodyDelegateProps } from './SharedUnlockedClassApp';
import { ValueProps } from './ValueProps';
import { useOsehImageStateValueWithCallbacks } from '../../../uikit/images/useOsehImageStateValueWithCallbacks';
import { useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { OsehImageProps } from '../../../uikit/images/OsehImageProps';
import { useOsehImageStateRequestHandler } from '../../../uikit/images/useOsehImageStateRequestHandler';
import { setVWC } from '../../../uikit/lib/setVWC';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { useStaleOsehImageOnSwap } from '../../../uikit/images/useStaleOsehImageOnSwap';
import { OsehImageFromState } from '../../../uikit/images/OsehImageFromState';

/**
 * Manages the contents seen on tablet or wider screens
 */
export const Tablet = (props: SharedUnlockedClassBodyDelegateProps): ReactElement => {
  const imageProps = useWritableValueWithCallbacks<OsehImageProps>(() => ({
    uid: null,
    jwt: null,
    displayWidth: 375,
    displayHeight: 667,
    alt: '',
  }));

  const imageHandler = useOsehImageStateRequestHandler({});
  const imageState = useStaleOsehImageOnSwap(
    useOsehImageStateValueWithCallbacks(
      {
        type: 'callbacks',
        props: () => imageProps.get(),
        callbacks: imageProps.callbacks,
      },
      imageHandler
    )
  );

  useEffect(
    (() => {
      if (window === undefined) {
        return () => {};
      }

      const mediaQuery = window.matchMedia('(min-width: 845px)');

      mediaQuery.addEventListener('change', onMediaChanged);
      onMediaChanged();
      return () => {
        mediaQuery.removeEventListener('change', onMediaChanged);
      };

      function onMediaChanged() {
        if (mediaQuery.matches) {
          if (imageProps.get().uid !== null) {
            return;
          }

          setVWC(imageProps, {
            ...imageProps.get(),
            ...props.backgroundImage,
          });
        } else {
          if (imageProps.get().uid === null) {
            return;
          }

          setVWC(imageProps, {
            ...imageProps.get(),
            uid: null,
            jwt: null,
          });
        }
      }
    })(),
    [imageProps, props.backgroundImage]
  );

  return (
    <>
      <div className={styles.leftColumn}>
        <RenderGuardedComponent
          props={imageState}
          component={(state) => {
            if (state.loading) {
              return (
                <img
                  className={styles.backgroundImage}
                  src={props.imageThumbhashDataUrl}
                  width="375px"
                  height="667px"
                />
              );
            }

            return <OsehImageFromState {...state} />;
          }}
        />
      </div>
      <div className={styles.rightColumn}>
        <ValueProps />
      </div>
    </>
  );
};
