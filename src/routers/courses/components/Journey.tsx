import { ReactElement } from 'react';
import { ValueWithCallbacks } from '../../../uikit/lib/Callbacks';
import { useMappedValueWithCallbacks } from '../../../uikit/hooks/useMappedValueWithCallbacks';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import { combineClasses } from '../../../uikit/lib/combineClasses';
import styles from './Journey.module.css';
import { formatDurationClock } from '../../../uikit/lib/networkResponseUtils';

/**
 * Displays a single journey within a list of journeys, usually for a course
 *
 * see JourneyList for a component that displays a list of these
 */
export const Journey = ({
  index,
  title,
  description,
  durationSeconds,
  activeIndexVWC,
  onClick,
}: {
  index: number;
  title: string;
  description: string;
  durationSeconds: number;
  activeIndexVWC: ValueWithCallbacks<number>;
  onClick: () => void;
}): ReactElement => {
  const isActive = useMappedValueWithCallbacks(
    activeIndexVWC,
    (activeIndex) => activeIndex === index
  );

  return (
    <RenderGuardedComponent
      props={isActive}
      component={(active) => (
        <button
          type="button"
          className={combineClasses(styles.journey, active ? styles.activeJourney : undefined)}
          onClick={(e) => {
            e.preventDefault();
            onClick();
          }}>
          <div className={styles.journeyTitleRow}>
            <div className={styles.journeyTitle}>
              {index + 1}. {title}
            </div>
            <div className={styles.journeyDuration}>
              {formatDurationClock(durationSeconds, {
                minutes: true,
                seconds: true,
                milliseconds: false,
              })}
            </div>
          </div>
          {active && <div className={styles.journeyDescription}>{description}</div>}
        </button>
      )}
    />
  );
};
