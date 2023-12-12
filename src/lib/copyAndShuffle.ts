/**
 * Returns a copy of the given array, shuffled. This function copies and
 * shuffles at the same time in a manner which is generally more efficient
 * than copying and then shuffling.
 *
 * @param arr The array to copy and shuffle
 * @returns The shuffled copy of the array
 */
export const copyAndShuffle = <T>(arr: T[]): T[] => {
  const res = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    res[i] = res[j];
    res[j] = arr[i];
  }
  return res;
};
