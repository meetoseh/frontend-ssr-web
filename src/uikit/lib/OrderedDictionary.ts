/**
 * A basic ordered dictionary, which is the combination of a dictionary and a
 * doubly-linked list, with a mix of the performance characteristics of both.
 * Typically, the following represents the interesting time complexities:
 *
 * lookup by lookupKey: O(1)
 * delete by lookupKey: O(1)
 * insert: O(n) for arbitrary insertion, O(1) for insertion at the end
 * peak front: O(1)
 * delete front: O(1)
 *
 * This is particularly good when you have a dictionary with expiration times,
 * and you want to be able to remove expired keys in order of expiration time.
 *
 * This is similar to the built in Map type, except more explicit about the
 * ordering; the default Map is guarranteed to be insertion ordered, but due
 * to how the functions are named relying on this is error prone.
 */
export class OrderedDictionary<T, LookupKey extends keyof T, SortKey extends keyof T> {
  private readonly lookupKey: LookupKey;
  private readonly sortKey: SortKey;
  private head: Node<T> | null;
  private tail: Node<T> | null;
  private readonly lookup: Map<T[LookupKey], Node<T>>;

  constructor(lookupKey: LookupKey, sortKey: SortKey) {
    this.lookupKey = lookupKey;
    this.sortKey = sortKey;
    this.head = null;
    this.tail = null;
    this.lookup = new Map();
  }

  /**
   * Unlinks the node from the list, updating the head/tail pointers as
   * necessary. O(1)
   *
   * @param node The node to unlink
   */
  private unlink(node: Node<T>) {
    if (this.lookup.size === 1) {
      this.head = null;
      this.tail = null;
      return;
    }

    if (node === this.head) {
      this.head = node.next;
      if (this.head !== null) {
        this.head.prev = null;
      }
      return;
    }

    if (node === this.tail) {
      this.tail = node.prev;
      if (this.tail !== null) {
        this.tail.next = null;
      }
      return;
    }

    let originalPrevious = node.prev;
    let originalNext = node.next;

    if (originalPrevious === null || originalNext === null) {
      throw new Error('node is not in the list');
    }

    originalPrevious.next = originalNext;
    originalNext.prev = originalPrevious;
  }

  /**
   * Inserts the given value after the given node in the list, updating
   * the head/tail pointers as necessary. O(1)
   */
  private linkAfter(node: Node<T>, value: T) {
    if (node === this.tail) {
      const oldTail = this.tail;
      this.tail = {
        value,
        prev: this.tail,
        next: null,
      };
      oldTail.next = this.tail;
      return;
    }

    const originalNext = node.next;
    if (originalNext === null) {
      throw new Error('node is not in the list');
    }

    const newNode = {
      value,
      prev: node,
      next: originalNext,
    };
    node.next = newNode;
    originalNext.prev = newNode;
  }

  /**
   * Inserts the given value before the given node in the list, updating
   * the head/tail pointers as necessary. O(1)
   */
  private linkBefore(node: Node<T>, value: T) {
    if (node === this.head) {
      const oldHead = this.head;
      this.head = {
        value,
        prev: null,
        next: this.head,
      };
      oldHead.prev = this.head;
      return;
    }

    const originalPrevious = node.prev;
    if (originalPrevious === null) {
      throw new Error('node is not in the list');
    }

    const newNode = {
      value,
      prev: originalPrevious,
      next: node,
    };
    node.prev = newNode;
    originalPrevious.next = newNode;
  }

  /**
   * Gets the value with the given key, if there is one, otherwise returns
   * undefined. O(1)
   */
  get(lookupKey: T[LookupKey]): T | undefined {
    const node = this.lookup.get(lookupKey);
    return node !== undefined ? node.value : undefined;
  }

  /**
   * Checks if a value with the given key exists. O(1)
   */
  has(lookupKey: T[LookupKey]): boolean {
    return this.lookup.has(lookupKey);
  }

  /**
   * Removes the value with the given key, if there is one. Returns true if
   * the value was removed, false if it was not found. O(1)
   */
  delete(lookupKey: T[LookupKey]): boolean {
    const node = this.lookup.get(lookupKey);
    if (node !== undefined) {
      this.unlink(node);
      this.lookup.delete(lookupKey);
      return true;
    }
    return false;
  }

  /**
   * Removes and returns the head value, i.e., the value with the lowest sort
   * key, if there is one, otherwise returns undefined. O(1)
   */
  shift(): T | undefined {
    if (this.head === null) {
      return undefined;
    }

    const value = this.head.value;
    this.unlink(this.head);
    this.lookup.delete(value[this.lookupKey]);
    return value;
  }

  /**
   * Removes and returns the tail value, i.e., the value with the highest sort
   * key, if there is one, otherwise returns undefined. O(1)
   */
  pop(): T | undefined {
    if (this.tail === null) {
      return undefined;
    }

    const value = this.tail.value;
    this.unlink(this.tail);
    this.lookup.delete(value[this.lookupKey]);
    return value;
  }

  /**
   * Peaks the head value, i.e., the value with the lowest sort key, if there
   * is one, otherwise returns undefined. O(1)
   */
  peakHead(): T | undefined {
    return this.head !== null ? this.head.value : undefined;
  }

  /**
   * Peaks the tail value, i.e., the value with the highest sort key, if there
   * is one, otherwise returns undefined. O(1)
   */
  peakTail(): T | undefined {
    return this.tail !== null ? this.tail.value : undefined;
  }

  /**
   * Inserts the given value at the head of the list.
   *
   * Raises an error if the lookup key already exists or the value is
   * not the lowest sort key. O(1)
   */
  unshift(value: T) {
    if (this.head === null) {
      this.head = {
        value,
        next: null,
        prev: null,
      };
      this.tail = this.head;
      this.lookup.set(value[this.lookupKey], this.head);
      return;
    }

    if (this.get(value[this.lookupKey]) !== undefined) {
      throw new Error('duplicate lookup key');
    }

    if (this.head.value[this.sortKey] < value[this.sortKey]) {
      throw new Error('value is not the lowest sort key');
    }

    this.head = {
      value,
      next: this.head,
      prev: null,
    };
    this.head.next!.prev = this.head;
    this.lookup.set(value[this.lookupKey], this.head);
  }

  /**
   * Pushes the given value to the tail of the list.
   *
   * Raises an error if the lookup key already exists or the value is
   * not the highest sort key. O(1)
   */
  push(value: T): void {
    if (this.tail === null) {
      this.tail = {
        value,
        next: null,
        prev: null,
      };
      this.head = this.tail;
      this.lookup.set(value[this.lookupKey], this.tail);
      return;
    }

    if (this.get(value[this.lookupKey]) !== undefined) {
      throw new Error('duplicate lookup key');
    }

    if (this.tail.value[this.sortKey] > value[this.sortKey]) {
      throw new Error('value is not the highest sort key');
    }

    this.tail = {
      value,
      next: null,
      prev: this.tail,
    };
    this.tail.prev!.next = this.tail;
    this.lookup.set(value[this.lookupKey], this.tail);
  }

  /**
   * Inserts the given value, replacing it if it already exists. Returns false
   * if the value was replaced, true if it was inserted. O(n)
   *
   * Prefer shift or push if you know the value will be inserted at the front
   * or back, respectively. This can be more appropriate to use if you expect you're
   * getting values "nearly" in order, but not necessarily _exactly_ in order.
   *
   * @param value The value to insert
   * @param hint A hint about where we should expect to find the value. We will
   *   begin the search at the head if the hint is 'front', and at the tail if
   *   the hint is back.
   * @returns true if inserted, false if replaced
   */
  insertSlow(value: T, hint: 'front' | 'back'): boolean {
    if (this.head === null) {
      this.push(value);
      return true;
    }

    if (this.tail === null) {
      throw new Error('head is not null but tail is');
    }

    let replaced = this.delete(value[this.lookupKey]);

    if (hint === 'front') {
      let node = this.head;
      while (node.next !== null && node.value[this.sortKey] < value[this.sortKey]) {
        node = node.next;
      }
      this.linkBefore(node, value);
    } else {
      let node = this.tail;
      while (node.prev !== null && node.value[this.sortKey] > value[this.sortKey]) {
        node = node.prev;
      }
      this.linkAfter(node, value);
    }

    return replaced;
  }

  /**
   * Yields the values in the list in order from lowest to highest. O(n)
   */
  *values(): Generator<T, void, void> {
    let node = this.head;
    while (node !== null) {
      yield node.value;
      node = node.next;
    }
  }

  /**
   * Returns the values in the list in order from lowest to highest. O(n)
   */
  valuesList(): T[] {
    const result: T[] = Array(this.lookup.size);

    let idx = 0;
    let node = this.head;
    while (node !== null) {
      result[idx++] = node.value;
      node = node.next;
    }

    return result;
  }

  /**
   * Deletes all values below the given key. Returns the number of values
   * deleted. O(n), where n is the number of values below the given key.
   *
   * @param key The key to delete below
   * @returns The number of values deleted
   */
  deleteBelow(key: T[SortKey]): number {
    let removed = 0;
    while (this.head !== null && this.head.value[this.sortKey] < key) {
      this.shift();
      removed++;
    }
    return removed;
  }

  /**
   * Deletes all values at or below the given key. Returns the number of values
   * deleted. O(n), where n is the number of values at or below the given key.
   *
   * @param key The key to delete at or below
   * @returns The number of values deleted
   */
  deleteAtOrBelow(key: T[SortKey]): number {
    let removed = 0;
    while (this.head !== null && this.head.value[this.sortKey] <= key) {
      this.shift();
      removed++;
    }
    return removed;
  }

  /**
   * Deletes all values above the given key. Returns the number of values
   * deleted. O(n), where n is the number of values above the given key.
   *
   * @param key The key to delete above
   * @returns The number of values deleted
   */
  deleteAbove(key: T[SortKey]): number {
    let removed = 0;
    while (this.tail !== null && this.tail.value[this.sortKey] > key) {
      this.pop();
      removed++;
    }
    return removed;
  }

  /**
   * Deletes all values at or above the given key. Returns the number of values
   * deleted. O(n), where n is the number of values at or above the given key.
   *
   * @param key The key to delete at or above
   * @returns The number of values deleted
   */
  deleteAtOrAbove(key: T[SortKey]): number {
    let removed = 0;
    while (this.tail !== null && this.tail.value[this.sortKey] >= key) {
      this.pop();
      removed++;
    }
    return removed;
  }
}

type Node<T> = {
  value: T;
  next: Node<T> | null;
  prev: Node<T> | null;
};
