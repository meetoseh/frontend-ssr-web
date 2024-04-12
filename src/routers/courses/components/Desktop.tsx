import { ReactElement, useContext } from 'react';
import { CoursePublicPageBodyComponentProps } from './CoursePublicPageApp';
import { useWindowSizeValueWithCallbacks } from '../../../uikit/hooks/useWindowSize';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { OsehImageProps } from '../../../uikit/images/OsehImageProps';
import {
  convertLogicalHeightToPhysicalHeight,
  convertLogicalWidthToPhysicalWidth,
  xAxisPhysicalPerLogical,
  yAxisPhysicalPerLogical,
} from '../../../uikit/images/DisplayRatioHelper';
import { useOsehImageStateValueWithCallbacks } from '../../../uikit/images/useOsehImageStateValueWithCallbacks';
import { adaptValueWithCallbacksAsVariableStrategyProps } from '../../../uikit/lib/adaptValueWithCallbacksAsVariableStrategyProps';
import styles from './Desktop.module.css';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { OsehImageFromState } from '../../../uikit/images/OsehImageFromState';
import { ProvidersList } from '../../../uikit/components/ProvidersList';
import { useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { useValuesWithCallbacksEffect } from '../../../uikit/hooks/useValuesWithCallbacksEffect';
import { BorderRadius, convertBorderRadiusToStyle } from '../../../uikit/lib/BorderRadius';
import { setVWC } from '../../../uikit/lib/setVWC';
import { useMappedValuesWithCallbacks } from '../../../uikit/hooks/useMappedValuesWithCallbacks';
import { useOsehContentTargetValueWithCallbacks } from '../../../uikit/content/useOsehContentTargetValueWithCallbacks';
import { createVideoSizeComparerForTarget } from '../../../uikit/content/createVideoSizeComparerForTarget';
import { ModalContext } from '../../../uikit/contexts/ModalContext';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { useOsehVideoContentState } from '../../../uikit/content/useOsehVideoContentState';
import { ValueProps } from '../../journeys/components/ValueProps';
import { LoginOptionsSeparator } from '../../../uikit/components/LoginOptionsSeparator';
import { DownloadAppLinks } from '../../../uikit/components/DownloadAppLinks';
import { PlayerForeground } from '../../../uikit/components/player/PlayerForeground';
import { JourneyList } from './JourneyList';

export const Desktop = (props: CoursePublicPageBodyComponentProps): ReactElement => {
  const modalContext = useContext(ModalContext);
  const windowSizeVWC = useWindowSizeValueWithCallbacks();
  const heroPropsVWC = useMappedValuesWithCallbacks(
    [windowSizeVWC, props.visibleVWC],
    (): OsehImageProps => {
      const size = windowSizeVWC.get();
      const visible = props.visibleVWC.get();
      if (size === null || !visible) {
        return {
          uid: null,
          jwt: null,
          displayWidth: 0,
          displayHeight: 0,
          alt: '',
        };
      }
      const width =
        convertLogicalWidthToPhysicalWidth(Math.min((size.width * 2) / 3, size.height)) /
        xAxisPhysicalPerLogical;

      const height =
        Math.floor(convertLogicalHeightToPhysicalHeight(width * 0.75)) / yAxisPhysicalPerLogical;

      return {
        uid: props.heroImage.uid,
        jwt: props.heroImage.jwt,
        displayWidth: width,
        displayHeight: height,
        alt: '',
      };
    }
  );
  const heroStateVWC = useOsehImageStateValueWithCallbacks(
    adaptValueWithCallbacksAsVariableStrategyProps(heroPropsVWC),
    props.imageHandler
  );
  const shortSigninUrlsVWC = useMappedValueWithCallbacks(props.signInUrls, (urls) =>
    urls.filter((u) => u.provider === 'Direct')
  );

  const heroContainerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const heroBorderRadiusVWC = useWritableValueWithCallbacks<BorderRadius | undefined>(
    () => undefined
  );
  useValuesWithCallbacksEffect([heroContainerRef, windowSizeVWC, heroStateVWC], () => {
    const eleRaw = heroContainerRef.get();
    if (eleRaw === null) {
      return undefined;
    }
    const ele = eleRaw;
    let active = true;
    if (window.MutationObserver) {
      const observer = new MutationObserver(recheck);
      observer.observe(ele, { attributes: true, childList: true, subtree: true });
      recheck();
      return () => {
        active = false;
        observer.disconnect();
      };
    } else {
      let timeout: NodeJS.Timeout | null = setTimeout(() => {
        if (!active) {
          return;
        }
        timeout = null;
        recheck();
      }, 100);
      recheck();
      return () => {
        active = false;
        if (timeout !== null) {
          clearTimeout(timeout);
        }
      };
    }

    function recheck() {
      if (!active) {
        return;
      }
      const bounds = ele.getBoundingClientRect();
      if (bounds.left <= 0) {
        setVWC(heroBorderRadiusVWC, { topLeft: 0, bottomLeft: 0, topRight: 10, bottomRight: 10 });
      } else {
        setVWC(heroBorderRadiusVWC, 10);
      }
    }
  });

  const introVideoTargetVWC = useOsehContentTargetValueWithCallbacks({
    ref: useMappedValueWithCallbacks(props.visibleVWC, (visible) =>
      visible ? props.seriesIntroRef : null
    ),
    comparer: useWritableValueWithCallbacks(() => createVideoSizeComparerForTarget(360, 640)),
    presign: true,
  });

  const introVideoStateVWC = useOsehVideoContentState({
    target: introVideoTargetVWC,
    size: useWritableValueWithCallbacks(() => ({ width: 360, height: 640 })),
  });

  const introVideoError = useWritableValueWithCallbacks<ReactElement | null>(() => null);
  useValueWithCallbacksEffect(introVideoStateVWC, (state) => {
    setVWC(introVideoError, state.error);
    return undefined;
  });
  useErrorModal(modalContext.modals, introVideoError, 'loading intro video');

  const introVideoContainerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  useValuesWithCallbacksEffect([introVideoContainerRef, introVideoStateVWC], () => {
    const eleRaw = introVideoContainerRef.get();
    if (eleRaw === null) {
      return;
    }
    const ele = eleRaw;

    const stateRaw = introVideoStateVWC.get();
    if (stateRaw.state !== 'loaded') {
      return;
    }
    const video = stateRaw.element;

    ele.appendChild(video);
    return () => {
      video.remove();
    };
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.heroContainer} ref={(r) => setVWC(heroContainerRef, r)}>
          <RenderGuardedComponent
            props={useMappedValuesWithCallbacks([heroStateVWC, heroBorderRadiusVWC], () => ({
              state: heroStateVWC.get(),
              borderRadius: heroBorderRadiusVWC.get(),
            }))}
            component={({ state, borderRadius }) => {
              if (state.loading) {
                return (
                  <img
                    className={styles.placeholder}
                    style={convertBorderRadiusToStyle(borderRadius)}
                    src={props.heroThumbhashDataURL}
                  />
                );
              }

              return <OsehImageFromState {...state} borderRadius={borderRadius} />;
            }}
          />
        </div>
        <div className={styles.headerRight}>
          <div className={styles.title}>{props.title}</div>
          <div className={styles.instructor}>{props.instructor}</div>
          <div className={styles.description}>{props.description}</div>
          <div className={styles.providerListContainer}>
            <RenderGuardedComponent
              props={shortSigninUrlsVWC}
              component={(signInUrls) => <ProvidersList items={signInUrls} />}
            />
          </div>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.player}>
          <div className={styles.introVideo} ref={(r) => setVWC(introVideoContainerRef, r)}>
            <RenderGuardedComponent
              props={introVideoStateVWC}
              component={(state) => {
                if (state.state !== 'loaded') {
                  return (
                    <img
                      className={styles.introVideoCover}
                      src={props.coverImageThumbhashDataURL}
                      width={360}
                      height={640}
                    />
                  );
                }
                return <></>;
              }}
            />
          </div>
          <div className={styles.playerForeground}>
            <PlayerForeground
              size={useWritableValueWithCallbacks(() => ({ width: 360, height: 640 }))}
              content={introVideoStateVWC}
              transcript={props.transcript}
              title={props.title}
              label="Series Introduction"
            />
          </div>
        </div>
        <div className={styles.journeys}>
          <div className={styles.journeysTitle}>{props.title}</div>
          <div className={styles.journeysHelp}>Click on each class to learn more</div>
          <JourneyList journeys={props.journeys} />
        </div>
      </div>
      <div className={styles.outroSep} />
      <div className={styles.outro}>
        <div className={styles.valueProps}>
          <div className={styles.valuePropsTitle}>
            Access all classes and series with Oseh+ starting at $8/month
          </div>
          <ValueProps />
        </div>
        <div className={styles.outroSignup}>
          <RenderGuardedComponent
            props={props.signInUrls}
            component={(signInUrls) => <ProvidersList items={signInUrls} />}
          />
          <LoginOptionsSeparator />
          <div>
            <DownloadAppLinks tracking />
          </div>
        </div>
      </div>
    </div>
  );
};
