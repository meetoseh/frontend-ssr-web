/**
 * Returns a class name string from the given class names.
 *
 * @param classes The class names to combine.
 * @returns The combined class name string.
 */
export const combineClasses = (...classes: (string | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};
