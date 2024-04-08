import { ContentFileWebExport } from './OsehContentTarget';

// most videos cannot be exported at odd resolutions, so we'll consider
// one more pixel on a side with an odd target to be an exact match
const isExactSide = (want: number, have: number) =>
  want === have || (want % 2 === 1 && have === want + 1);

/**
 * Given that we want to display a video at a given logical width and height,
 * and we have a video export at a given real width and height, this determines
 * the largest exact pixelPhysicalSize that is smaller or equal to what we have,
 * and then returns the amount of wasted space for what we have compare to one
 * which exactly maps to that pixelPhysicalSize.
 */
export const getEffectiveVideoTarget = (
  want: { width: number; height: number },
  have: { width: number; height: number }
): {
  pixelPhysicalSize: number;
  uselessArea: number;
  usefulArea: number;
} => {
  let pixelPhysicalSize = 1;
  let pixelsPerLogicalPixel = devicePixelRatio;
  while (true) {
    const wantWidth = Math.ceil(want.width * pixelsPerLogicalPixel);
    const wantHeight = Math.ceil(want.height * pixelsPerLogicalPixel);

    if (wantWidth <= have.width && wantHeight <= have.height) {
      const usefulArea = wantWidth * wantHeight;
      return {
        pixelPhysicalSize,
        usefulArea,
        uselessArea: have.width * have.height - usefulArea,
      };
    }

    pixelPhysicalSize++;
    pixelsPerLogicalPixel = devicePixelRatio / pixelPhysicalSize;
  }
};

const tieBreaker = (a: ContentFileWebExport, b: ContentFileWebExport) => b.bandwidth - a.bandwidth;

/**
 * Creates the standard content file web export comparison function when you are
 * trying to display a video with the given logical width and height.
 *
 * This will try to find the video which exactly matches the required size when
 * considering the pixel density of the current display; failing that, it will
 * prefer an integer multiple of that down to a size of 1.
 *
 * Ties for a given resolution, which are rare, are broken on more bandwidth
 * (higher quality) at that resolution.
 */
export const createVideoSizeComparerForTarget =
  (width: number, height: number): ((a: ContentFileWebExport, b: ContentFileWebExport) => number) =>
  (a, b) => {
    const aWidthRaw = a.formatParameters.width as number | undefined | null;
    const aHeightRaw = a.formatParameters.height as number | undefined | null;
    const bWidthRaw = b.formatParameters.width as number | undefined | null;
    const bHeightRaw = b.formatParameters.height as number | undefined | null;

    const aWidth = aWidthRaw ?? null;
    const aHeight = aHeightRaw ?? null;
    const bWidth = bWidthRaw ?? null;
    const bHeight = bHeightRaw ?? null;

    if (aWidth === null || aHeight === null || bWidth === null || bHeight === null) {
      if (aWidth !== null && aHeight !== null) {
        return -1;
      } else if (bWidth !== null && bHeight !== null) {
        return 1;
      }

      return tieBreaker(a, b);
    }

    if (aWidth === bWidth && aHeight === bHeight) {
      return tieBreaker(a, b);
    }

    // pixelPhysicalSize:
    //   1 means that we have a real pixel from the video for every pixel on the display
    //   2 means that we have a real pixel from the video for every 2x2 block of pixels on the display
    //   etc

    // pixelsPerLogicalPixel = devicePixelRatio / pixelPhysicalSize:
    //   this is the number of real pixels from the video for every _logical_ pixel on the display
    //   a value of 1 means that we have 1 real pixel per logical pixel

    // first we will look for exact exports at an acceptable number of pixels per logical
    // pixels, since this will allow for much faster video rendering.

    // on desktops generally 2/3 of a real pixel per logical pixel is acceptable (720p on a 1080p display)
    // whereas on mobile at least 1 real pixel per logical pixel is generally acceptable.
    // we'll approximate this with the real width/height target we are going for

    const acceptableMinPixelPerLogicalPixel = width * height < 1000 * 1000 ? 1 : 0.66;

    let pixelPhysicalSize = 1;
    let pixelsPerLogicalPixel = devicePixelRatio;
    while (pixelsPerLogicalPixel > acceptableMinPixelPerLogicalPixel - 1e-6) {
      const wantWidth = Math.ceil(width * pixelsPerLogicalPixel);
      const wantHeight = Math.ceil(height * pixelsPerLogicalPixel);

      const aIsExactMatch = isExactSide(wantWidth, aWidth) && isExactSide(wantHeight, aHeight);
      const bIsExactMatch = isExactSide(wantWidth, bWidth) && isExactSide(wantHeight, bHeight);

      if (aIsExactMatch && bIsExactMatch) {
        return b.bandwidth - a.bandwidth;
      }
      if (aIsExactMatch) {
        return -1;
      }
      if (bIsExactMatch) {
        return 1;
      }
      pixelPhysicalSize++;
      pixelsPerLogicalPixel = devicePixelRatio / pixelPhysicalSize;
    }

    const aEffective = getEffectiveVideoTarget(
      { width, height },
      { width: aWidth, height: aHeight }
    );
    const bEffective = getEffectiveVideoTarget(
      { width, height },
      { width: bWidth, height: bHeight }
    );

    // we will allow for discarding up to 10% of pixels per every pixelPhysicalSize
    // we can go up
    if (aEffective.pixelPhysicalSize === bEffective.pixelPhysicalSize) {
      if (aEffective.uselessArea === bEffective.uselessArea) {
        return tieBreaker(a, b);
      } else {
        return aEffective.uselessArea - bEffective.uselessArea;
      }
    } else if (aEffective.pixelPhysicalSize < bEffective.pixelPhysicalSize) {
      const bias = 0.1 * (bEffective.pixelPhysicalSize - aEffective.pixelPhysicalSize);
      const aRatio = aEffective.uselessArea / aEffective.usefulArea;
      const bRatio = bEffective.uselessArea / bEffective.usefulArea;

      const comparison = aRatio - (bRatio + bias);
      if (comparison < -1e-6) {
        return -1;
      } else if (comparison > 1e-6) {
        return 1;
      } else {
        return -1;
      }
    } else {
      const bias = 0.1 * (aEffective.pixelPhysicalSize - bEffective.pixelPhysicalSize);
      const aRatio = aEffective.uselessArea / aEffective.usefulArea;
      const bRatio = bEffective.uselessArea / bEffective.usefulArea;

      const comparison = aRatio + bias - bRatio;
      if (comparison < -1e-6) {
        return -1;
      } else if (comparison > 1e-6) {
        return 1;
      } else {
        return 1;
      }
    }
  };
