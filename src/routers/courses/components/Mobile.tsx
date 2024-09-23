import { CSSProperties, ReactElement, useContext } from 'react';
import { CoursePublicPageBodyComponentProps } from './CoursePublicPageApp';
import { useWindowSizeValueWithCallbacks } from '../../../uikit/hooks/useWindowSize';
import { useMappedValuesWithCallbacks } from '../../../uikit/hooks/useMappedValuesWithCallbacks';
import { OsehImageProps } from '../../../uikit/images/OsehImageProps';
import { useOsehImageStateValueWithCallbacks } from '../../../uikit/images/useOsehImageStateValueWithCallbacks';
import { adaptValueWithCallbacksAsVariableStrategyProps } from '../../../uikit/lib/adaptValueWithCallbacksAsVariableStrategyProps';
import styles from './Mobile.module.css';
import { Wordmark } from '../../../uikit/components/footer/Wordmark';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { BorderRadius, convertBorderRadiusToStyle } from '../../../uikit/lib/BorderRadius';
import { OsehImageFromState } from '../../../uikit/images/OsehImageFromState';
import { ModalContext } from '../../../uikit/contexts/ModalContext';
import { useOsehContentTargetValueWithCallbacks } from '../../../uikit/content/useOsehContentTargetValueWithCallbacks';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { createVideoSizeComparerForTarget } from '../../../uikit/content/createVideoSizeComparerForTarget';
import { useOsehVideoContentState } from '../../../uikit/content/useOsehVideoContentState';
import { useValueWithCallbacksEffect } from '../../../uikit/hooks/useValueWithCallbacksEffect';
import { setVWC } from '../../../uikit/lib/setVWC';
import { useErrorModal } from '../../../uikit/hooks/useErrorModal';
import { useValuesWithCallbacksEffect } from '../../../uikit/hooks/useValuesWithCallbacksEffect';
import { PlayerForeground } from '../../../uikit/components/player/PlayerForeground';
import { useStyleVWC } from '../../../uikit/hooks/useStyleVWC';
import { JourneyList } from './JourneyList';
import { ValueProps } from '../../journeys/components/ValueProps';
import { useMediaInfo } from '../../../uikit/hooks/useMediaInfo';
import { useReactManagedValueAsValueWithCallbacks } from '../../../uikit/hooks/useReactManagedValueAsValueWithCallbacks';
import { ContinueOnWeb } from '../../../uikit/components/ContinueOnWeb';

const borderRadius: BorderRadius = { topLeft: 0, topRight: 0, bottomLeft: 10, bottomRight: 10 };

export const Mobile = (props: CoursePublicPageBodyComponentProps): ReactElement => {
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
      return {
        uid: props.heroImage.uid,
        jwt: props.heroImage.jwt,
        displayWidth: size.width,
        displayHeight: size.width,
        alt: '',
      };
    }
  );
  const heroStateVWC = useOsehImageStateValueWithCallbacks(
    adaptValueWithCallbacksAsVariableStrategyProps(heroPropsVWC),
    props.imageHandler
  );

  const introVideoSizeVWC = useMappedValueWithCallbacks(windowSizeVWC, (size) =>
    size === null ? { width: 0, height: 0 } : size
  );

  const introVideoTargetVWC = useOsehContentTargetValueWithCallbacks({
    ref: useMappedValueWithCallbacks(props.visibleVWC, (visible) =>
      visible ? props.seriesIntroRef : null
    ),
    comparer: useMappedValueWithCallbacks(introVideoSizeVWC, (size) =>
      createVideoSizeComparerForTarget(size.width, size.height)
    ),
    presign: true,
  });

  const introVideoStateVWC = useOsehVideoContentState({
    target: introVideoTargetVWC,
    size: introVideoSizeVWC,
  });

  const mediaInfo = useMediaInfo({
    mediaVWC: introVideoStateVWC,
    currentTranscriptPhrasesVWC: props.transcript,
  });

  const introVideoError = useWritableValueWithCallbacks<ReactElement | null>(() => null);
  useValueWithCallbacksEffect(introVideoStateVWC, (state) => {
    setVWC(introVideoError, state.error);
    return undefined;
  });
  useErrorModal(modalContext.modals, introVideoError, 'loading intro video');

  const introVideoContainerRef = useWritableValueWithCallbacks<HTMLDivElement | null>(() => null);
  const introVideoStyle = useMappedValueWithCallbacks(
    windowSizeVWC,
    (size): CSSProperties => ({
      width: size === null ? '100%' : `${size.width}px`,
      height: size === null ? '100vh' : `${size.height}px`,
    })
  );
  useStyleVWC(introVideoContainerRef, introVideoStyle);

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

  useValueWithCallbacksEffect(introVideoContainerRef, (eleRaw) => {
    if (eleRaw === null) {
      return undefined;
    }
    if (!window?.IntersectionObserver) {
      return;
    }
    const ele = eleRaw;

    let mounted = true;
    let timeout: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!mounted) {
          observer.disconnect();
          return;
        }

        if (entries.length === 0) {
          return;
        }

        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }

        const entry = entries[0];
        if (entry.intersectionRatio < 0.9) {
          return;
        }

        if (entry.intersectionRatio >= 1) {
          return;
        }

        timeout = setTimeout(() => {
          timeout = null;
          const eleLoc = ele.getBoundingClientRect();
          window.scrollTo({
            top: window.scrollY + eleLoc.bottom - window.innerHeight,
            behavior: 'smooth',
          });
        }, 500);
      },
      {
        threshold: [0.9, 0.98, 0.99, 1.0],
      }
    );
    observer.observe(ele);

    return () => {
      mounted = false;
      observer.disconnect();
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    };
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <a href="https://www.oseh.com" className={styles.wordmark}>
          <Wordmark size={{ height: 20 }} color="white" />
        </a>
      </div>
      <div className={styles.hero}>
        <RenderGuardedComponent
          props={heroStateVWC}
          component={(state) => {
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
      <div className={styles.sections}>
        <div className={styles.section}>
          <div className={styles.title}>{props.title}</div>
          <div className={styles.instructor}>{props.instructor}</div>
        </div>
        <div className={styles.section}>
          <ContinueOnWeb tracking />
        </div>
        <div className={styles.section}>
          <div className={styles.description}>{props.description}</div>
        </div>
        <div className={styles.player}>
          <div
            className={styles.introVideo}
            style={introVideoStyle.get()}
            ref={(r) => setVWC(introVideoContainerRef, r)}>
            <RenderGuardedComponent
              props={introVideoStateVWC}
              component={(state) => {
                if (state.state !== 'loaded') {
                  return (
                    <RenderGuardedComponent
                      props={introVideoSizeVWC}
                      component={({ width, height }) => (
                        <img
                          className={styles.introVideoCover}
                          src={props.coverImageThumbhashDataURL}
                          width={width === 0 ? '100%' : width}
                          height={height === 0 ? '100vh' : height}
                        />
                      )}
                    />
                  );
                }
                return <></>;
              }}
            />
          </div>
          <div className={styles.playerForeground}>
            <PlayerForeground
              size={windowSizeVWC}
              content={introVideoStateVWC}
              mediaInfo={mediaInfo}
              transcript={props.transcript}
              title={useReactManagedValueAsValueWithCallbacks(props.title)}
              label="Series Introduction"
            />
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.journeysTitle}>{props.title}</div>
          <div className={styles.journeysHelp}>Click on each class to learn more</div>
          <JourneyList journeys={props.journeys} />
        </div>
        <div className={styles.section}>
          <div className={styles.line} />
        </div>
        <div className={styles.section}>
          <ValueProps />
        </div>
        <div className={styles.section}>
          <ContinueOnWeb tracking />
        </div>
        <div className={styles.section}>
          <div className={styles.osehPlus}>
            Access all classes and series with Oseh+, starting at $8/month (billed annually).
          </div>
        </div>
      </div>
    </div>
  );
};
