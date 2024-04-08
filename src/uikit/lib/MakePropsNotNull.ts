type NotNull<T> = T extends null ? never : T;
type PropsNotNull<T> = {
  [K in keyof T]: NotNull<T[K]>;
};

/**
 * Returns T, but such that the given keys are not nullable.
 */
export type MakePropsNotNull<T, K extends keyof T> = Omit<T, K> & PropsNotNull<Pick<T, K>>;
