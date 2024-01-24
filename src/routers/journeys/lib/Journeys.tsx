import { convertUsingKeymap, CrudFetcherKeyMap } from '../../../uikit/crud/CrudFetcher';
import { Journey } from './Journey';
import { keyMap as journeySubcategoryKeyMap } from './JourneySubcategories';
import { keyMap as instructorKeyMap } from './Instructors';

export const keyMap: CrudFetcherKeyMap<Journey> = {
  audio_content: 'audioContent',
  background_image: 'backgroundImage',
  blurred_background_image: 'blurredBackgroundImage',
  darkened_background_image: 'darkenedBackgroundImage',
  subcategory: (_, val) => ({
    key: 'subcategory',
    value: convertUsingKeymap(val, journeySubcategoryKeyMap),
  }),
  instructor: (_, val) => ({
    key: 'instructor',
    value: convertUsingKeymap(val, instructorKeyMap),
  }),
  created_at: (_, val) => ({ key: 'createdAt', value: new Date(val * 1000) }),
  deleted_at: (_, val) => ({ key: 'deletedAt', value: val ? new Date(val * 1000) : null }),
  special_category: 'specialCategory',
  variation_of_journey_uid: 'variationOfJourneyUID',
};
