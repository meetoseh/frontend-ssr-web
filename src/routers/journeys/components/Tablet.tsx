import { ReactElement, useEffect, useMemo } from 'react';
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
import { Callout } from './Callout';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';
import { LoginOptionsSeparator } from '../../../uikit/components/LoginOptionsSeparator';
import { ProvidersList } from '../../../uikit/components/ProvidersList';

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

  const totalTime = useMemo(() => {
    const minutes = Math.floor(props.durationSeconds / 60);
    const seconds = Math.floor(props.durationSeconds % 60);

    return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
  }, [props.durationSeconds]);

  return (
    <>
      <div className={styles.leftColumn}>
        <div className={styles.playerBackground}>
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
        <div className={styles.playerPlayContainer}>
          <div className={styles.playerPlayButton}>
            <div className={styles.iconPlay} />
          </div>
        </div>
        <div className={styles.playerBottomContents}>
          <div className={styles.playerControlsContainer}>
            <div className={styles.playerTitleAndInstructorContainer}>
              <div className={styles.playerInstructor}>{props.instructor}</div>
              <div className={styles.playerTitle}>{props.title}</div>
            </div>
            <div className={styles.playerIconButtonsContainer}>
              <div className={styles.playerIconButton}>
                <div className={styles.iconMute} />
              </div>
              <div className={styles.playerIconButton}>
                <div className={styles.iconClosedCaptions} />
              </div>
            </div>
          </div>
          <div className={styles.playerProgressContainer}>
            <div className={styles.playerProgressFull} style={{ width: '43%' }} />
            <div className={styles.playerProgressDot} />
            <div className={styles.playerProgressEmpty} />
          </div>
          <div className={styles.playerDurationContainer}>
            <div className={styles.playerCurrentTime}>0:45</div>
            <div className={styles.playerTotalTime}>{totalTime}</div>
          </div>
        </div>
      </div>
      <div className={styles.rightColumn}>
        <div className={styles.valuePropsContainer}>
          <ValueProps />
        </div>
        <div className={styles.calloutContainer}>
          <Callout />
        </div>
        <div className={styles.downloadContainer}>
          <DownloadAppLinks />
        </div>
        <div className={styles.loginOptionsSeparatorContainer}>
          <LoginOptionsSeparator />
        </div>
        <div className={styles.providerListContainer}>
          <RenderGuardedComponent
            props={props.signInUrls}
            component={(signInUrls) => <ProvidersList items={signInUrls} />}
          />
        </div>
      </div>
    </>
  );
};
