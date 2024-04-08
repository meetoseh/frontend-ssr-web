import { CSSProperties } from 'react';

/** Convenience type for working with border radius */
export type BorderRadius =
  | number
  | {
      topLeft?: number;
      topRight?: number;
      bottomRight?: number;
      bottomLeft?: number;
    };

/** Converts the indicated border radius to the matching style */
export const convertBorderRadiusToStyle = (
  borderRadius: BorderRadius | undefined
): CSSProperties => {
  if (borderRadius === undefined) {
    return {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomLeftRadius: 0,
    };
  }

  if (typeof borderRadius === 'number') {
    return {
      borderTopLeftRadius: borderRadius,
      borderTopRightRadius: borderRadius,
      borderBottomRightRadius: borderRadius,
      borderBottomLeftRadius: borderRadius,
    };
  }

  return {
    borderTopLeftRadius: borderRadius.topLeft,
    borderTopRightRadius: borderRadius.topRight,
    borderBottomRightRadius: borderRadius.bottomRight,
    borderBottomLeftRadius: borderRadius.bottomLeft,
  };
};
