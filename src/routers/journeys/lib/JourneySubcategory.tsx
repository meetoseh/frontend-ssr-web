/**
 * Describes the admin view of a journey subcategory. For users this is
 * exposed only with the externalName, meaning that it's possible there
 * are many journey subcategories that users can't distinguish between.
 */
export type JourneySubcategory = {
  /**
   * Stable unique identifier
   */
  uid: string;

  /**
   * The internal name for the subcategory, typically more specific
   */
  internalName: string;

  /**
   * The display name for the subcategory, typically less specific
   */
  externalName: string;

  /**
   * A non-negative number generally less than one which influences content
   * selection towards this subcategory. Higher numbers are more influential.
   */
  bias: number;
};
