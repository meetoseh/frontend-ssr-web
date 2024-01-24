import { Instructor } from './Instructor';
import { JourneySubcategory } from './JourneySubcategory';

/**
 * A journey is an audio experience combined with a prompt and background image.
 * This describes the admin view of a journey, which is accessed by admin users
 * with standard authorization. A slightly different view is available for users
 * when using a journey JWT.
 */
export type Journey = {
  /**
   * Stable unique identifier
   */
  uid: string;

  /**
   * A reference to the content file containing the audio for the journey
   */
  audioContent: {
    uid: string;
    jwt: string;
  };

  /**
   * A reference to the image file containing the background image for the journey
   */
  backgroundImage: {
    uid: string;
    jwt: string;
  };

  /**
   * A reference to the image file containing the blurred background image for the journey
   */
  blurredBackgroundImage: {
    uid: string;
    jwt: string;
  };

  /**
   * A reference to the image file containing the darkened background image for the journey
   */
  darkenedBackgroundImage: {
    uid: string;
    jwt: string;
  };

  /**
   * The subcategory of the journey
   */
  subcategory: JourneySubcategory;

  /**
   * The instructor for the journey
   */
  instructor: Instructor;

  /**
   * The title for the journey, very short
   */
  title: string;

  /**
   * The description for the journey, longer than the title but still short
   */
  description: string;

  /**
   * The prompt information for the journey. See the API docs for more information
   */
  prompt: any & { style: 'numeric' | 'press' | 'color' | 'word' };

  /**
   * When the journey was created
   */
  createdAt: Date;

  /**
   * If the journey has been soft-deleted, when it was deleted
   */
  deletedAt: Date | null;

  /**
   * If the sample for this journey is available, the sample, otherwise null.
   * If the journey is changed, it will have the old sample until the new
   * sample is available.
   */
  sample: { uid: string; jwt: string } | null;

  /**
   * If the full video for this journey is available, the full video, otherwise null.
   * If the journey is changed, it will have the old full video until the new
   * full video is available.
   */
  video: { uid: string; jwt: string } | null;

  /**
   * If the journey belongs to a special category, the special category it belongs to,
   * otherwise null. Undefined if not returned from that particular route.
   */
  specialCategory: 'ai' | null | undefined;

  /**
   * If this journey is a variation on another journey, such as by updating the
   * title and description to be more appropriate for a course but keeping the
   * content the same, the uid of the original journey, otherwise null. A
   * journey cannot be deleted if it has any undeleted variations, and a journey
   * cannot be a variation of a journey which is itself a variation.
   */
  variationOfJourneyUID: string | null;
};
