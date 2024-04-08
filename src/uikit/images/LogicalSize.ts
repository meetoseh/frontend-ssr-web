export type AspectRatioComparer = (
  a: { width: number; height: number },
  b: { width: number; height: number }
) => number;

export type LogicalSize =
  | { width: number; height: number }
  | {
      width: number;
      height: null;
      compareAspectRatios: AspectRatioComparer;
    }
  | {
      width: null;
      height: number;
      compareAspectRatios: AspectRatioComparer;
    };

export type UnderspecifiedPhysicalSize = LogicalSize;
