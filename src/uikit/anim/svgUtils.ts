/**
 * Converts a 0-1 float to a 0-255 byte. Clamps to 0-255, so
 * negative values become 0 and values > 1 become 255.
 * @param color The color fraction to convert
 * @returns The color byte
 */
export const colorFloatToByte = (color: number): number => {
  return Math.max(0, Math.min(255, Math.round(color * 255)));
};

/**
 * Interprets list of 4 fractional values (0-1) as a CSS color.
 */
export const colorToCSS = (
  color: [number, number, number, number] | readonly [number, number, number, number]
) => {
  return `rgba(${colorFloatToByte(color[0])}, ${colorFloatToByte(color[1])}, ${colorFloatToByte(
    color[2]
  )}, ${color[3]})`;
};

/**
 * Provides the CSS string for rendering a color represented as
 * 4 numbers, the first 3 are 0-255 integer values, and the last
 * is a 0-1 fractional alpha value.
 */
export const colorByteRGBFractionalAlphaToCSS = (
  color: [number, number, number, number] | readonly [number, number, number, number]
) => {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
};

/**
 * Converts 3 integer 0-255 values to the corresponding 100% opacity
 * CSS color string. Additional values are ignored.
 */
export const simpleColorToCss = (
  color:
    | [number, number, number]
    | readonly [number, number, number]
    | [number, number, number, number]
    | readonly [number, number, number, number]
) => {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
};

/**
 * Renders the given fractional (0-1) RGB color as a CSS color string.
 */
export const fractionalColorToCss = (
  color: [number, number, number] | readonly [number, number, number] | number[]
) => {
  return `rgb(${colorFloatToByte(color[0])}, ${colorFloatToByte(color[1])}, ${colorFloatToByte(
    color[2]
  )})`;
};

/**
 * Converts a given number value to how it should be stored within an SVG;
 * clipping to 3 decimal places and removing trailing zeros to make the svg
 * render consistently.
 */
export const makeSVGNumber = (v: number): string => {
  return `${Number(v.toFixed(3))}`;
};

/**
 * Makes a path from the given list of points, where the list of points
 * is provided as a list of numbers, where each pair of numbers is an
 * x/y coordinate. This path moves to the first point, then draws a line
 * to each subsequent point.
 */
export const makeLinePath = (data: number[]): string => {
  if (data.length === 0) {
    return '';
  }

  if (data.length % 2 !== 0) {
    throw new Error('data must have an even number of elements');
  }

  const numPoints = data.length / 2;

  const parts = [`M${makeSVGNumber(data[0])} ${makeSVGNumber(data[1])}`];
  for (let i = 1; i < numPoints; i++) {
    parts.push(`L${makeSVGNumber(data[i * 2])} ${makeSVGNumber(data[i * 2 + 1])}`);
  }
  return parts.join('');
};

/**
 * Makes a path that goes to the first point, then draws a line to
 * the subsequent point. This is a simple variant of makeLinePath
 */
export const makeSimplePath = ({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}): string => {
  return makeLinePath([x1, y1, x2, y2]);
};
