/**
 * Svgs are infinitely scalable but will appear squished or stretched if the
 * aspect ratio its rendered at doesn't match the viewbox, hence they are specified
 * either by width or by height but not both.
 */
export type SvgRequestedSize =
  | {
      width: number;
      height?: undefined;
    }
  | {
      width?: undefined;
      height: number;
    };

/**
 * Computes the [width, height] of an svg requested to render at the given
 * width or the given height and which has a viewbox of the given width and
 * height.
 */
export const computeSvgSize = ({
  requested,
  viewbox,
}: {
  requested: SvgRequestedSize;
  viewbox: { width: number; height: number };
}) => {
  if (requested.width === undefined) {
    return [`${(viewbox.width / viewbox.height) * requested.height}px`, `${requested.height}px`];
  }

  return [`${requested.width}px`, `${(viewbox.height / viewbox.width) * requested.width}px`];
};
