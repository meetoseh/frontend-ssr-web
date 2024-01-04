/**
 * Gets how many useful pixels there are if you have an image
 * of the given width and height, and you want to display it
 * at the given display width and height.
 *
 * For example, if you have an image of 1000x1000 pixels, and
 * you want an image of 100x100 pixels, then there are 100x100
 * useful pixels on a cover crop, as you will take the center
 * 100x100 pixels of the image.
 *
 * If you have an image of 1000x1000 pixels, and you want an
 * image of 500x2000 pixels, there are 500x1000 useful pixels
 *
 * This is one part of the calculation of determining which
 * image to use.
 *
 * @param have The width and height of the image you are considering
 * @param want The width and height of the image you want to display
 */
const getUsefulArea = (
  have: { width: number; height: number },
  want: { width: number; height: number }
) => {
  const effectiveHave = {
    width: Math.min(have.width, want.width),
    height: Math.min(have.height, want.height),
  };

  return effectiveHave.width * effectiveHave.height;
};

/**
 * Gets how many useless pixels there are if you have an image
 * of the given width and height, and you want to display it
 * at the given display width and height.
 *
 * When thinking of this calculation, it's helpful to imagine
 * we are cropping to the the top-left rather than the center;
 * one can be easily convinced this doesn't effect the answer,
 * since we use the same area either way.
 *
 * For example, if you have an image of 1000x1000 pixels, and
 * you want an image of 100x100 pixels, then there are 3 rectangles
 * which are useless: 900x100 on the right, 900x900 square
 * bottom right, and 100x900 below. Thus the total useless area is
 * (900x100) + (900x900) + (100x900) = 990,000 pixels. This is the
 * same as subtracting the useful area: 1000x1000 - 100x100
 *
 * If you have an image of 200x200 and want 300x100, then the useless
 * area is below: 200x100 = 20,000 pixels. Alternatively, it's the
 * (200*200) total pixels - (200*100) useful pixels = 20,000 pixels.
 *
 * @param have The width and height of the image you are considering
 * @param want The width and height of the image you want to display
 */
const getUselessArea = (
  have: { width: number; height: number },
  want: { width: number; height: number }
) => {
  return have.width * have.height - getUsefulArea(have, want);
};

/**
 * Compares available images to determine which is the best when
 * you want to display an image of the given width and height.
 *
 * @param want The width and height of the image you want to display
 * @param a The first option to compare
 * @param b The second option to compare
 * @return negative if a is better, positive if b is better, 0 if they are equal
 */
export const compareSizes = (
  want: { width: number; height: number },
  a: { width: number; height: number },
  b: { width: number; height: number }
): number => {
  // first by useful area (larger is better), then by
  // useless area (smaller is better)
  const usefulAreaA = getUsefulArea(a, want);
  const usefulAreaB = getUsefulArea(b, want);
  if (usefulAreaA !== usefulAreaB) {
    return usefulAreaB - usefulAreaA;
  }

  const uselessAreaA = getUselessArea(a, want);
  const uselessAreaB = getUselessArea(b, want);
  return uselessAreaA - uselessAreaB;
};
