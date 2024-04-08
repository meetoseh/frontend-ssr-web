import { LogicalSize } from './LogicalSize';

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

/**
 * Compares available images to determine which is the best when
 * you want to display an image of the given width and height.
 * This assumes that either image can be scaled an arbitrary amount
 * losslessly, and hence only the aspect ratio matters.
 *
 * PERF:
 *   This is only a exact comparison if the sizes are all sufficiently
 *   small. This is definitely the case if all the lengths are less than
 *   the fourth root of the maximum integer, i.e., about 9700x9700 images.
 *
 *   If you can guarrantee both a and b will be scaled using the same
 *   dimension, this can handle images up to the sqrt of the maximum
 *   integer, i.e., about 2^25x2^25 images.
 *
 *   Note that since the aspect ratio is the only thing that matters,
 *   the above restrictions can be mostly sidestepped by reducing
 *   a, b, and want by their greatest common divisor prior to calling
 *   this function.
 *
 *   If this detects an overflow is possible, it will perform this
 *   reduction automatically. If this reduction fails, an inexact
 *   comparison will be performed.
 *
 * @param want The width and height of the image you want to display
 * @param a The first option to compare
 * @param b The second option to compare
 * @return negative if a is better, positive if b is better, 0 if they are equal
 */
export const compareVectorSizes = (
  want: LogicalSize,
  a: { width: number; height: number },
  b: { width: number; height: number }
): number => {
  if (want.width === null || want.height === null) {
    return want.compareAspectRatios(a, b);
  }

  // a logical way to write this function would be to define the
  // aspect ratio as W/H, and return the aspect ratio which is closest
  // to the desired aspect ratio. But this leads to a problem:

  // suppose we want a 1:1 aspect ratio, and we have to options: 2:3, 3:2.
  // clearly, these two options should be equal, due to rotational symmetry.
  // However, 2:3 has an aspect ratio of 0.67, and 3:2 has an aspect ratio of 1.5,
  // and 0.33 is less than 0.5.

  // hence, comparing aspect ratios like this is flawed.

  // another way to compare aspect ratios is to first scale each size to the
  // smallest rasterized size that can be cropped to fit, and then compare
  // which has less wasted space. This will lead, as desired, to 2:3 and 3:2
  // being equal.

  // here on out just describes how to calculate that without floating point
  // inaccuracies:

  // let a and b be the two sizes, such that a.W is the width of a, and a.H is the height of a.
  // let T be the target size, such that T.W is the width of T, and T.H is the height of T.

  // let A be the scaling ratio for a, and B be the scaling ratio for b.
  // A = max(T.W / a.W, T.H / a.H)
  // B = max(T.W / b.W, T.H / b.H)
  //
  // let U be the useful area required; U = want.width * want.height
  //
  // note that we want to avoid ever directly computing A or B as that
  // would involve floating point division, which is not exact.
  //
  // result must match the sign of
  //   getUselessArea(a * A, T) - getUselessArea(b * B, T)
  //
  // since we know a * A and b * B are at least as large on both dimensions..
  //   = (a.W * A * a.H * A - T.W * T.H) - (b.W * B * b.H * B - T.W * T.H)
  //   = a.W * A * a.H * A - b.W * B * b.H * B
  //   = a.W * a.H * A^2 - b.W * b.H * B^2
  //   = a.W * a.H * max(T.W / a.W, T.H / a.H)^2 - b.W * b.H * max(T.W / b.W, T.H / b.H)^2
  //
  // we can break this into 4 cases exactly
  // to determine if T.W / a.W > T.H / a.H:
  //   T.W / a.W > T.H / a.H
  //   <=> T.W * a.H > T.H * a.W
  //   <=> T.W * a.H - T.H * a.W > 0
  //
  // note this comparison is not effected by scaling a or T by a positive factor

  const scaleAFromWidth = want.width * a.height - want.height * a.width > 0;
  const scaleBFromWidth = want.width * b.height - want.height * b.width > 0;

  if (scaleAFromWidth && scaleBFromWidth) {
    // case 1: A = T.W / a.W
    //     and B = T.W / b.W
    //
    //  = a.W * a.H * (T.W / a.W)^2 - b.W * b.H * (T.W / b.W)^2
    //  up to sign = a.W * a.H * T.W^2 * b.W^2 - b.W * b.H * T.W^2 * a.W^2
    //  = T.W^2 * (a.W * a.H * b.W^2 - b.W * b.H * a.W^2)
    //  up to sign = a.W * a.H * b.W^2 - b.W * b.H * a.W^2
    //  = a.W * b.W * (a.H * b.W - b.H * a.W)
    //  up to sign = a.H * b.W - b.H * a.W
    return a.height * b.width - b.height * a.width;
  } else if (!scaleAFromWidth && !scaleBFromWidth) {
    // case 2: A = T.H / a.H
    //     and B = T.H / b.H
    //
    //  = a.W * a.H * (T.H / a.H)^2 - b.W * b.H * (T.H / b.H)^2
    //  up to sign = a.W * a.H * T.H^2 * b.H^2 - b.W * b.H * T.H^2 * a.H^2
    //  = T.H^2 * (a.W * a.H * b.H^2 - b.W * b.H * a.H^2)
    //  up to sign = a.W * a.H * b.H^2 - b.W * b.H * a.H^2
    //  = a.H * b.H * (a.W * b.H - b.W * a.H)
    //  up to sign = a.W * b.H - b.W * a.H
    return a.width * b.height - b.width * a.height;
  } else if (scaleAFromWidth) {
    // case 3: A = T.W / a.W
    //     and B = T.H / b.H
    //
    // = a.W * a.H * (T.W / a.W)^2 - b.W * b.H * (T.H / b.H)^2
    // up to sign = a.W * a.H * T.W^2 * b.H^2 - b.W * b.H * T.H^2 * a.W^2
    // = a.W * b.H * (a.H * T.W^2 * b.H - b.W * T.H^2 * a.W)
    // up to sign = a.H * T.W^2 * b.H - b.W * T.H^2 * a.W
    //
    // this is only exact if the dims are less than the fourth root of
    // the maximum integer, i.e., about 9700x9700 images, which seems likely

    // check if reduction is required
    if (
      a.width > 9700 ||
      a.height > 9700 ||
      want.width > 9700 ||
      want.height > 9700 ||
      b.width > 9700 ||
      b.height > 9700
    ) {
      a = reduceImageSizeExactly(a);
      b = reduceImageSizeExactly(b);
      want = reduceImageSizeExactly(want);
    }

    return (
      a.height * want.width * want.width * b.height - b.width * want.height * want.height * a.width
    );
  } else {
    // case 4: A = T.H / a.H
    //     and B = T.W / b.W
    //
    // = a.W * a.H * (T.H / a.H)^2 - b.W * b.H * (T.W / b.W)^2
    // up to sign = a.W * a.H * T.H^2 * b.W^2 - b.W * b.H * T.W^2 * a.H^2
    // = a.H * b.W * (a.W * T.H^2 * b.W - b.H * T.W^2 * a.H)
    // up to sign = a.W * T.H^2 * b.W - b.H * T.W^2 * a.H
    //
    // this is only exact if the dims are less than the fourth root of
    // the maximum integer, i.e., about 9700x9700 images, which seems likely

    // check if reduction is required
    if (
      a.width > 9700 ||
      a.height > 9700 ||
      want.width > 9700 ||
      want.height > 9700 ||
      b.width > 9700 ||
      b.height > 9700
    ) {
      a = reduceImageSizeExactly(a);
      b = reduceImageSizeExactly(b);
      want = reduceImageSizeExactly(want);
    }

    return (
      a.width * want.height * want.height * b.width - b.height * want.width * want.width * a.height
    );
  }
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function reduceImageSizeExactly(size: { width: number; height: number }) {
  const divisor = gcd(size.width, size.height);
  return {
    width: size.width / divisor,
    height: size.height / divisor,
  };
}
