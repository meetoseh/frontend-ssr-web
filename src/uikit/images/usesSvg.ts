/**
 * If svg support is available, i.e., we can render arbitrary SVG
 * files without transforming them into a different format.
 */
export const USES_SVG: Promise<boolean> = Promise.resolve(true);
