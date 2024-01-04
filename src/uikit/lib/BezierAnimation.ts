/**
 * Provides tooling for animations that are more configurable than Animated. Generally
 * it's more intuitive to skip Animated and call setNativeProps (or equivalent) directly,
 * in which case there are some common patterns that are abstracted here.
 */

import { Bezier } from './Bezier';

/**
 * Describes a 1D animation, which is an interpolation between two values and a
 * Bezier as the easing function. It would be more general for the easing
 * function to specified as (t: number) => number, but a Bezier is so universal
 * that having that extra context is useful for debugging. Also, prefixing the
 * name with Bezier avoids naming conflicts.
 */
export type BezierAnimation = {
  /**
   * The starting value
   */
  from: number;
  /**
   * The ending value
   */
  to: number;
  /**
   * If the animation has started, the time at which it started, typically
   * from requestAnimationFrame. If the animation has not started, usually
   * because it was initialized outside of a requestAnimationFrame callback,
   * this will be null and set when the animation is first applied.
   */
  startedAt: DOMHighResTimeStamp | null;
  /**
   * The easing function
   */
  ease: Bezier;
  /**
   * The duration of the animation in milliseconds
   */
  duration: number;
};

/**
 * Computes the current value of the given bezier animation, given the current time.
 * If the animation is not yet started, it will be started at the given time.
 */
export const calculateAnimValue = (anim: BezierAnimation, now: number): number => {
  if (anim.startedAt === null) {
    anim.startedAt = now;
    return anim.from;
  }

  const progress = (now - anim.startedAt) / anim.duration;
  return anim.ease.y_x(Math.min(1.0, progress)) * (anim.to - anim.from) + anim.from;
};

type UpdateAnimArgs = {
  now: number | null;
  current: number;
  target: number;
  oldAnim: BezierAnimation | null;
  duration: number;
  ease: Bezier;
};

/**
 * Gives the new animation that should be used to animate from the current value
 * to the target value, given the currently configured animation
 */
export const updateAnim = ({
  now,
  current,
  target,
  oldAnim,
  duration,
  ease,
}: UpdateAnimArgs): BezierAnimation | null => {
  if (current === target) {
    return null;
  }

  if (oldAnim !== null && oldAnim.to === target) {
    if (now !== null && oldAnim.startedAt !== null && oldAnim.startedAt + oldAnim.duration <= now) {
      return null;
    }

    return oldAnim;
  }

  return {
    from: current,
    to: target,
    startedAt: now,
    ease,
    duration,
  };
};

/**
 * Converts the given 7-character color hex string, e.g., #ff0000, to a
 * 3-element array of floats, e.g., [1.0, 0.0, 0.0].
 * @param color The color hex string.
 * @returns The color as a 3-element array of floats, each from 0.0 to 1.0.
 */
export const getColor3fFromHex = (color: string): number[] => {
  if (color.length !== 7) {
    throw new Error('Invalid color hex string: ' + color);
  }
  const r = parseInt(color.substring(1, 3), 16) / 255.0;
  const g = parseInt(color.substring(3, 5), 16) / 255.0;
  const b = parseInt(color.substring(5, 7), 16) / 255.0;
  return [r, g, b];
};

/**
 * Linearly interpolates between two numbers, given the progress.
 *
 * @param from The starting number, at t=0
 * @param to The ending number, at t=1
 * @param t The progress, from 0.0 to 1.0.
 * @returns The interpolated number
 */
export const interpolateNumber = (from: number, to: number, t: number): number => {
  return from + (to - from) * t;
};

/**
 * Interpolates between two colors, given the progress. The method for
 * interpolation is not guarranteed, but generally will look at least as good as
 * linear.
 *
 * @param from The starting color, as a 3-element array of floats, each from 0.0 to 1.0.
 * @param to The ending color, as a 3-element array of floats, each from 0.0 to 1.0.
 * @param t The progress, from 0.0 to 1.0.
 */
export const interpolateColor = (
  from: number[],
  to: number[],
  t: number
): [number, number, number] => {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
};

/**
 * Determines if the given animation is complete
 * @param anim The animation
 * @param now The current time
 * @returns True if the animation is complete, false otherwise
 */
export const animIsComplete = (anim: BezierAnimation, now: number): boolean => {
  return anim.startedAt !== null && anim.startedAt + anim.duration <= now;
};
