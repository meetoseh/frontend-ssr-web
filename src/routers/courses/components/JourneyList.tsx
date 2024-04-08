import { ReactElement } from 'react';
import styles from './JourneyList.module.css';
import { CoursePublicPageJourney } from './CoursePublicPageApp';
import { Journey } from './Journey';
import { useWritableValueWithCallbacks } from '../../../uikit/lib/Callbacks';

/**
 * Displays a list of the journeys for a given course.
 */
export const JourneyList = ({
  journeys,
}: {
  journeys: CoursePublicPageJourney[];
}): ReactElement => {
  const activeJourneyIdxVWC = useWritableValueWithCallbacks<number>(() => 0);

  return (
    <div className={styles.container}>
      {journeys.map((j, idx) => (
        <Journey key={idx} index={idx} {...j} activeIndexVWC={activeJourneyIdxVWC} />
      ))}
    </div>
  );
};
