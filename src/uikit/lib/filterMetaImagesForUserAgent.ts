import { OpenGraphMetaImage } from './OpenGraphMetaImage';

/**
 * Filters the given meta images based on the given user agent; some user agents
 * can't handle multiple images or prefer a specific aspect ratio.
 *
 * This modifies the given array in place.
 *
 * @param metaImages The meta images to filter
 * @param userAgent The user agent to filter for
 */
export const filterMetaImagesForUserAgent = (
  metaImages: OpenGraphMetaImage[],
  userAgent: string | undefined
): void => {
  if (userAgent === undefined) {
    return;
  }
  const userAgentLower = userAgent.toLowerCase();
  if (userAgentLower.includes('twitterbot') && userAgentLower.includes('facebookexternalhit')) {
    // iMessage can only handle 1 meta image and prefers square
    if (metaImages.length > 1) {
      metaImages.sort(
        (a, b) => Math.abs(a.width / a.height - 1) - Math.abs(b.width / b.height - 1)
      );
      metaImages.splice(1, metaImages.length - 1);
    }
  }
};
