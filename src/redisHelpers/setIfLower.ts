import { createRedisScript } from './createRedisScript';

type SetIfLowerArgs = {
  /**
   * The key to mutate
   */
  key: string;
  /**
   * The value to set in the key if it either does not exist or it has
   * a value higher than the given value.
   */
  value: number;
};

export const setIfLower = createRedisScript(
  'src/redisHelpers/setIfLower.lua',
  ({ key, value }: SetIfLowerArgs) => ({ keys: [key], argv: [value.toString()] }),
  (result) => result === 1
);
