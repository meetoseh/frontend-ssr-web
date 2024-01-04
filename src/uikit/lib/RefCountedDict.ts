/**
 * A basic implementation of a manually ref counted dictionary. This is useful
 * in certain caching scenarios.
 *
 * This as get and set methods, but no delete method, as deletes happen
 * automatically when the ref count reaches 0.
 */
export class RefCountedDict<K, V> {
  private readonly refs: Map<K, { value: V; refCount: number }>;
  private readonly onRemoved?: (key: K, value: V) => void;

  /**
   * Creates a new empty dictionary which calls the given function
   * when a value is removed from the dictionary. The function is
   * called immediately after the value has been removed, so has()
   * will return false when the function is called.
   */
  constructor(onRemoved?: (key: K, value: V) => void) {
    this.refs = new Map();
    this.onRemoved = onRemoved;
  }

  /**
   * The length of the dictionary, which is the number of key/value
   * pairs with a ref count greater than 0.
   */
  get size(): number {
    return this.refs.size;
  }

  /**
   * Calls the given callback for each key/value pair in the dictionary
   * with a ref count greater than 0.
   *
   * If the dictionary is mutated during the iteration, then the only guarrantee
   * is that every item which was in the dictionary at the start of the
   * iteration and at the time the callback was invoked will be iterated over.
   * Items which are removed or added may or may not be iterated over.
   *
   * @param callback The callback to call for each key/value pair.
   * @returns The number of key/value pairs iterated over.
   */
  forEach(callback: (key: K, value: V) => void): number {
    const keys = Array.from(this.refs.keys());
    let counter = 0;
    for (const key of keys) {
      const value = this.refs.get(key);
      if (value !== undefined) {
        callback(key, value.value);
        counter++;
      }
    }
    return counter;
  }

  /**
   * Returns true if there is a value associated with the given key,
   * otherwise returns false.
   */
  has(key: K): boolean {
    return this.refs.has(key);
  }

  /**
   * If there is a value associated with the given key, increments its
   * ref count and returns it. Otherwise, returns undefined.
   *
   * @param key The key to get the value for.
   * @returns The value associated with the key, or undefined if there is no
   *   value associated with the key.
   */
  get(key: K): V | undefined {
    const value = this.refs.get(key);
    if (value === undefined) {
      return undefined;
    }
    value.refCount++;
    return value.value;
  }

  /**
   * Sets the value associated with the given key and increments its
   * ref count, but only if it does not exist. Raises an error if the
   * value already exists (use replace() instead, which does not change
   * the ref count).
   *
   * @param key The key to set the value for.
   * @param value The value to set.
   */
  set(key: K, value: V): void {
    if (this.refs.has(key)) {
      throw new Error('key already exists');
    }

    this.refs.set(key, { value, refCount: 1 });
  }

  /**
   * Replaces the value with the given key without changing its ref count.
   * Raises an error if the value does not exist (use set() instead, which
   * will change the ref count).
   *
   * @param key The key to replace the value of
   * @param value The value to replace it with.
   * @returns The old value.
   */
  replace(key: K, value: V): V {
    const element = this.refs.get(key);
    if (element === undefined) {
      throw new Error('key does not exist');
    }
    const oldValue = element.value;
    element.value = value;
    return oldValue;
  }

  /**
   * Reduces the ref count on the given key, if it exists, otherwise
   * raises an error.
   *
   * @param key The key to reduce the ref count of.
   */
  reduceRefCount(key: K): void {
    const element = this.refs.get(key);
    if (element === undefined) {
      throw new Error('key does not exist');
    }
    element.refCount--;
    if (element.refCount === 0) {
      this.refs.delete(key);
      if (this.onRemoved !== undefined) {
        this.onRemoved(key, element.value);
      }
    }
  }
}
