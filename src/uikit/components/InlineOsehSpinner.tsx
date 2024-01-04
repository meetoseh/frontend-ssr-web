import {
  VariableStrategyProps,
  useVariableStrategyPropsAsValueWithCallbacks,
} from '../anim/VariableStrategyProps';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { BezierAnimator, BezierColorAnimator, TrivialAnimator } from '../anim/AnimationLoop';
import { ease } from '../lib/Bezier';
import { ReactElement, useEffect, useRef } from 'react';
import { useAnimationTargetAndRendered } from '../anim/useAnimationTargetAndRendered';
import { useMappedValueWithCallbacks } from '../hooks/useMappedValueWithCallbacks';
import { colorToCSS, makeSVGNumber } from '../anim/svgUtils';
import { useValueWithCallbacksEffect } from '../hooks/useValueWithCallbacksEffect';
import { setVWC } from '../lib/setVWC';
import { useValuesWithCallbacksEffect } from '../hooks/useValuesWithCallbacksEffect';
import { useMappedValueWithCallbacksEffect } from '../hooks/useMappedValueWithCallbacksEffect';

type InlineOsehSpinnerVariant = 'black' | 'white' | 'white-thin' | 'primary';
type InlineOsehSpinnerProps = {
  size: VariableStrategyProps<{ width: number } | { height: number }>;
  variant?: InlineOsehSpinnerVariant;
};

const opacityAnimationTime = 200;
const dashAnimationTime = 1200;
const dashEase = ease;

const forwardDotTime = opacityAnimationTime - 50;
const forwardTime = dashAnimationTime + 700;
const backwardTime = dashAnimationTime - opacityAnimationTime;
const backwardDotTime = opacityAnimationTime + 500;
const paddingToCompensateForPoorSVGStrokesNearEdge = 4;

/**
 * Shows the oseh brandmark in a configurable size. The brandmark is nearly
 * square, but not quite. To avoid accidentally squishing it, you can specify
 * either a width or a height, and the other dimension will be calculated.
 */
export const InlineOsehSpinner = ({
  size: sizeVariableStrategy,
  variant = 'white',
}: InlineOsehSpinnerProps) => {
  const sizeVWC = useVariableStrategyPropsAsValueWithCallbacks(sizeVariableStrategy);
  const state = useWritableValueWithCallbacks<SpinnerState>(() => 'dotVisible');

  useEffect(() => {
    setVWC(state, 'dotVisible');
    let timeout: NodeJS.Timeout = setTimeout(onDotFinished, forwardDotTime);

    function onDotFinished() {
      setVWC(state, 'visible');
      timeout = setTimeout(onForwardFinished, forwardTime);
    }

    function onForwardFinished() {
      setVWC(state, 'dotVisible');
      timeout = setTimeout(onBackwardFinished, backwardTime);
    }

    function onBackwardFinished() {
      setVWC(state, 'hidden');
      timeout = setTimeout(onBackwardDotFinished, backwardDotTime);
    }

    function onBackwardDotFinished() {
      setVWC(state, 'dotVisible');
      timeout = setTimeout(onDotFinished, forwardDotTime);
    }

    return () => {
      clearTimeout(timeout);
    };
  }, [state]);

  return (
    <div>
      <Spinner size={sizeVWC} variant={variant} state={state} />
    </div>
  );
};

// spinner is essentially an FSM
type SpinnerState = 'hidden' | 'dotVisible' | 'visible';
type SpinnerProps = {
  size: ValueWithCallbacks<{ width: number } | { height: number }>;
  variant: InlineOsehSpinnerVariant;
  state: ValueWithCallbacks<SpinnerState>;
};

type SpinnerAnimationState = {
  requestedSize: { width: number } | { height: number };
  strokeWidth: number;
  // rgba, 0-1 range for each
  strokeColor: [number, number, number, number];
  circle1LengthFraction: number;
  circle2LengthFraction: number;
};

type ComputedAnimationState = {
  realStrokeWidth: number;
  pointScaleFactor: number;
  viewboxPaddingX: number;
  viewboxPaddingY: number;
  size: { width: number; height: number };
  viewBox: { width: number; height: number };
};

const variantStrokeColor = (variant: InlineOsehSpinnerVariant): [number, number, number] => {
  if (variant === 'black') {
    return [0, 0, 0];
  } else if (variant === 'white' || variant === 'white-thin') {
    return [1, 1, 1];
  } else if (variant === 'primary') {
    return [0.2, 0.286, 0.298];
  }
  throw new Error(`Unknown inline oseh spinner variant for stroke color: ${variant}`);
};

const variantStrokeWidth = (variant: InlineOsehSpinnerVariant): number => {
  if (variant === 'white-thin') {
    return 3;
  }
  return 5;
};

const widthBeforeStroke = 100;
const heightBeforeStroke = 94.4;

const computeViewboxForStrokeWidth = (strokeWidth: number): { width: number; height: number } => {
  return {
    width: widthBeforeStroke + strokeWidth,
    height: heightBeforeStroke + strokeWidth,
  };
};

const getComputedState = (state: SpinnerAnimationState): ComputedAnimationState => {
  const strokeWidth = state.strokeWidth;
  const viewBox = computeViewboxForStrokeWidth(strokeWidth);

  const requestedScale =
    'width' in state.requestedSize
      ? state.requestedSize.width / viewBox.width
      : state.requestedSize.height / viewBox.height;

  return {
    viewBox: {
      width: viewBox.width * requestedScale + paddingToCompensateForPoorSVGStrokesNearEdge * 2,
      height: viewBox.height * requestedScale + paddingToCompensateForPoorSVGStrokesNearEdge * 2,
    },
    size: {
      width: viewBox.width * requestedScale + paddingToCompensateForPoorSVGStrokesNearEdge * 2,
      height: viewBox.height * requestedScale + paddingToCompensateForPoorSVGStrokesNearEdge * 2,
    },
    viewboxPaddingX: paddingToCompensateForPoorSVGStrokesNearEdge,
    viewboxPaddingY: paddingToCompensateForPoorSVGStrokesNearEdge,
    realStrokeWidth: strokeWidth * requestedScale,
    pointScaleFactor: requestedScale,
  };
};

const isComputedStateEqual = (a: ComputedAnimationState, b: ComputedAnimationState): boolean => {
  return (
    a.realStrokeWidth === b.realStrokeWidth &&
    a.pointScaleFactor === b.pointScaleFactor &&
    a.viewboxPaddingX === b.viewboxPaddingX &&
    a.viewboxPaddingY === b.viewboxPaddingY &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height &&
    a.viewBox.width === b.viewBox.width &&
    a.viewBox.height === b.viewBox.height
  );
};

const hiddenSpinnerAnimationState = (
  requestedSize: { width: number } | { height: number },
  variant: InlineOsehSpinnerVariant
): SpinnerAnimationState => {
  return {
    requestedSize,
    strokeWidth: variantStrokeWidth(variant),
    strokeColor: [...variantStrokeColor(variant), 0],
    circle1LengthFraction: MIN_STROKE_DASH_OFFSET,
    circle2LengthFraction: MIN_STROKE_DASH_OFFSET,
  };
};

const dotSpinnerAnimationState = (
  requestedSize: { width: number } | { height: number },
  variant: InlineOsehSpinnerVariant
): SpinnerAnimationState => {
  return {
    requestedSize,
    strokeWidth: variantStrokeWidth(variant),
    strokeColor: [...variantStrokeColor(variant), 1],
    circle1LengthFraction: MIN_STROKE_DASH_OFFSET,
    circle2LengthFraction: MIN_STROKE_DASH_OFFSET,
  };
};

const shownSpinnerAnimationState = (
  requestedSize: { width: number } | { height: number },
  variant: InlineOsehSpinnerVariant
): SpinnerAnimationState => {
  return {
    requestedSize,
    strokeWidth: variantStrokeWidth(variant),
    strokeColor: [...variantStrokeColor(variant), 1],
    circle1LengthFraction: 1,
    circle2LengthFraction: 1,
  };
};

type RawSvgPathPart = {
  operation: 'A' | 'C' | 'M' | 'Z';
  values: number[];
};

const renderShiftedScaledPoint = (
  x: number,
  y: number,
  dx: number,
  dy: number,
  s: number,
  out: string[]
): void => {
  const shiftedX = x + dx;
  const shiftedY = y + dy;
  out.push(makeSVGNumber(shiftedX * s));
  out.push(' ');
  out.push(makeSVGNumber(shiftedY * s));
};

const renderShiftedScaledRawSvgPathPart = (
  part: RawSvgPathPart,
  dx: number,
  dy: number,
  s: number,
  out: string[]
) => {
  out.push(part.operation);

  if (part.operation === 'A') {
    // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
    out.push(makeSVGNumber(part.values[0] * s));
    out.push(' ');
    out.push(makeSVGNumber(part.values[1] * s));
    out.push(' ');
    for (let i = 2; i < part.values.length - 2; i++) {
      out.push(makeSVGNumber(part.values[i]));
      out.push(' ');
    }
    renderShiftedScaledPoint(
      part.values[part.values.length - 2],
      part.values[part.values.length - 1],
      dx,
      dy,
      s,
      out
    );
    return;
  }

  for (let i = 0; i < part.values.length; i += 2) {
    if (i !== 0) {
      out.push(' ');
    }
    renderShiftedScaledPoint(part.values[i], part.values[i + 1], dx, dy, s, out);
  }
};

type RawSvgPath = RawSvgPathPart[];

const renderShiftedScaledRawSvgPath = (
  path: RawSvgPath,
  dx: number,
  dy: number,
  s: number
): string => {
  const result: string[] = [];
  for (const part of path) {
    renderShiftedScaledRawSvgPathPart(part, dx, dy, s, result);
  }
  return result.join('');
};

const CIRCLE_PATH: RawSvgPath = [
  { operation: 'M', values: [71.808, 58.453] },
  { operation: 'A', values: [35.904, 35.904, 0, 0, 1, 35.904, 94.357] },
  { operation: 'A', values: [35.904, 35.904, 0, 0, 1, 0, 58.453] },
  { operation: 'A', values: [35.904, 35.904, 0, 0, 1, 35.904, 22.549] },
  { operation: 'A', values: [35.904, 35.904, 0, 0, 1, 71.808, 58.453] },
  { operation: 'Z', values: [] },
];

const ARC_PATH: RawSvgPath = [
  { operation: 'M', values: [35.345, 59.578] },
  { operation: 'C', values: [27.32, 49.625, 24.994, 36.236, 29.193, 24.16] },
  { operation: 'C', values: [33.427, 12.236, 43.958, 3.288, 56.312, 0.755] },
  { operation: 'C', values: [83.775, -4.818, 106.971, 21.429, 98.065, 47.999] },
  { operation: 'C', values: [94.366, 59.036, 85.611, 67.638, 74.51, 71.143] },
  { operation: 'C', values: [73.044, 71.609, 71.55, 71.983, 70.036, 72.262] },
];

const MIN_STROKE_DASH_OFFSET = 0.01;

const Spinner = ({ size, variant, state: fsmState }: SpinnerProps): ReactElement => {
  const state = useAnimationTargetAndRendered(
    () => hiddenSpinnerAnimationState(size.get(), variant),
    () => [
      new TrivialAnimator('requestedSize'),
      new BezierAnimator(
        ease,
        350,
        (p) => p.strokeWidth,
        (p, v) => (p.strokeWidth = v)
      ),
      new BezierColorAnimator(
        ease,
        opacityAnimationTime,
        (p) => p.strokeColor,
        (p, v) => (p.strokeColor = v)
      ),
      new BezierAnimator(
        dashEase,
        dashAnimationTime,
        (p) => p.circle1LengthFraction,
        (p, v) => (p.circle1LengthFraction = v)
      ),
      new BezierAnimator(
        dashEase,
        dashAnimationTime,
        (p) => p.circle2LengthFraction,
        (p, v) => (p.circle2LengthFraction = v)
      ),
    ]
  );

  useValuesWithCallbacksEffect([size, fsmState], () => {
    const fsm = fsmState.get();
    if (fsm === 'hidden') {
      setVWC(state.target, hiddenSpinnerAnimationState(size.get(), variant));
    } else if (fsm === 'dotVisible') {
      setVWC(state.target, dotSpinnerAnimationState(size.get(), variant));
    } else {
      setVWC(state.target, shownSpinnerAnimationState(size.get(), variant));
    }
    return undefined;
  });

  const computed = useMappedValueWithCallbacks(state.rendered, (s) => getComputedState(s), {
    outputEqualityFn: isComputedStateEqual,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const circlePathRef = useRef<SVGPathElement>(null);
  const arcPathRef = useRef<SVGPathElement>(null);

  useValueWithCallbacksEffect(computed, (c) => {
    const ref = svgRef.current;
    if (ref === null) {
      return;
    }
    ref.setAttribute('width', makeSVGNumber(c.size.width));
    ref.setAttribute('height', makeSVGNumber(c.size.height));
    ref.setAttribute(
      'viewBox',
      `0 0 ${makeSVGNumber(c.viewBox.width)} ${makeSVGNumber(c.viewBox.height)}`
    );
    return undefined;
  });

  useValueWithCallbacksEffect(computed, (c) => {
    const outer = containerRef.current;
    if (outer !== null) {
      outer.style.width = `${c.size.width - c.viewboxPaddingX * 2}px`;
      outer.style.height = `${c.size.height - c.viewboxPaddingY * 2}px`;
      outer.style.left = `-${c.viewboxPaddingX}px`;
      outer.style.top = `-${c.viewboxPaddingY}px`;
    }

    const circleRef = circlePathRef.current;
    if (circleRef !== null) {
      circleRef.setAttribute(
        'd',
        renderShiftedScaledRawSvgPath(
          CIRCLE_PATH,
          c.realStrokeWidth / (2 * c.pointScaleFactor) + c.viewboxPaddingX / c.pointScaleFactor,
          c.realStrokeWidth / (2 * c.pointScaleFactor) + c.viewboxPaddingY / c.pointScaleFactor,
          c.pointScaleFactor
        )
      );
      circleRef.setAttribute('stroke-width', makeSVGNumber(c.realStrokeWidth));
    }

    const arcRef = arcPathRef.current;
    if (arcRef !== null) {
      arcRef.setAttribute(
        'd',
        renderShiftedScaledRawSvgPath(
          ARC_PATH,
          c.realStrokeWidth / (2 * c.pointScaleFactor) + c.viewboxPaddingX / c.pointScaleFactor,
          c.realStrokeWidth / (2 * c.pointScaleFactor) + c.viewboxPaddingY / c.pointScaleFactor,
          c.pointScaleFactor
        )
      );
      arcRef.setAttribute('stroke-width', makeSVGNumber(c.realStrokeWidth));
    }

    return undefined;
  });

  useMappedValueWithCallbacksEffect(
    state.rendered,
    (r) => r.strokeColor,
    (c) => {
      const cssColor = colorToCSS(c);
      const circleRef = circlePathRef.current;
      if (circleRef !== null) {
        circleRef.setAttribute('stroke', cssColor);
      }

      const arcRef = arcPathRef.current;
      if (arcRef !== null) {
        arcRef.setAttribute('stroke', cssColor);
      }

      return undefined;
    },
    {
      outputEqualityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3],
    }
  );

  useMappedValueWithCallbacksEffect(
    state.rendered,
    (s) => s.circle1LengthFraction,
    (f) => {
      const ref = circlePathRef.current;
      if (ref !== null) {
        ref.setAttribute('stroke-dashoffset', makeSVGNumber(1 - f));
      }
      return undefined;
    }
  );

  useMappedValueWithCallbacksEffect(
    state.rendered,
    (s) => s.circle2LengthFraction,
    (f) => {
      const ref = arcPathRef.current;
      if (ref !== null) {
        ref.setAttribute('stroke-dashoffset', makeSVGNumber(1 - f));
      }
      return undefined;
    }
  );

  return (
    <div
      style={{
        width: `${computed.get().size.width - computed.get().viewboxPaddingX * 2}px`,
        height: `${computed.get().size.height - computed.get().viewboxPaddingX * 2}px`,
        position: 'relative',
        left: `-${computed.get().viewboxPaddingX}px`,
        top: `-${computed.get().viewboxPaddingY}px`,
        overflow: 'visible',
      }}
      ref={containerRef}>
      <svg
        width={makeSVGNumber(computed.get().size.width)}
        height={makeSVGNumber(computed.get().size.height)}
        viewBox={`0 0 ${makeSVGNumber(computed.get().viewBox.width)} ${makeSVGNumber(
          computed.get().viewBox.height
        )}`}
        ref={svgRef}>
        <path
          d={renderShiftedScaledRawSvgPath(
            CIRCLE_PATH,
            computed.get().realStrokeWidth / 2 + computed.get().viewboxPaddingX,
            computed.get().realStrokeWidth / 2 + computed.get().viewboxPaddingY,
            computed.get().pointScaleFactor
          )}
          fill="none"
          stroke={colorToCSS(state.rendered.get().strokeColor)}
          strokeLinecap="round"
          strokeMiterlimit="10"
          strokeWidth={makeSVGNumber(state.rendered.get().strokeWidth)}
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={makeSVGNumber(1 - state.rendered.get().circle1LengthFraction)}
          ref={circlePathRef}
        />
        <path
          d={renderShiftedScaledRawSvgPath(
            ARC_PATH,
            computed.get().realStrokeWidth / 2 + computed.get().viewboxPaddingX,
            computed.get().realStrokeWidth / 2 + computed.get().viewboxPaddingY,
            computed.get().pointScaleFactor
          )}
          fill="none"
          stroke={
            state.rendered.get().circle2LengthFraction <= 0
              ? 'none'
              : colorToCSS(state.rendered.get().strokeColor)
          }
          strokeLinecap="round"
          strokeMiterlimit="10"
          strokeWidth={makeSVGNumber(state.rendered.get().strokeWidth)}
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={makeSVGNumber(1 - state.rendered.get().circle1LengthFraction)}
          ref={arcPathRef}
        />
      </svg>
    </div>
  );
};
