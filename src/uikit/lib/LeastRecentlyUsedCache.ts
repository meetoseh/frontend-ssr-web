/**
 * A basic Least Recently Used (LRU) cache implementation with a fixed
 * capacity. When the cache is full, the least recently used item is
 * removed to make room for the new item.
 *
 * Implemented as a doubly-linked list with a map for O(1) add/lookup
 */
export class LeastRecentlyUsedCache<K, V> {
  /**
   * If there is at least one item in the cache, this is the head
   * of the list, i.e, the most recently used item
   */
  private head: LRUNode<K, V> | null;

  /**
   * If there is at least one item in the cache, this is the tail
   * of the list, i.e, the least recently used item
   */
  private tail: LRUNode<K, V> | null;

  /**
   * A map from keys to nodes in the linked list, to allow for O(1)
   * lookup
   */
  private lookup: Map<K, LRUNode<K, V>>;

  /**
   * The maximum number of items that can be stored in the cache
   */
  private capacity: number;

  /**
   * Initializes an empty cache with the given capacity
   * @param capacity the maximum number of items that can be stored in the cache
   */
  constructor(capacity: number) {
    if (capacity < 2) {
      throw new Error('Capacity must be at least 2');
    }
    this.head = null;
    this.tail = null;
    this.lookup = new Map();
    this.capacity = capacity;
  }

  /**
   * Adds the given item to the cache. If the key is already in the cache, it is
   * moved to the head of the list and updated. If the cache is full and the key
   * is not already in the cache, the least recently used key is removed to make
   * room for the new item.
   *
   * @param key the key of the item to add
   * @param value the value of the item to add or replace
   * @returns true if the item was added, false if it replaced an existing item
   */
  add(key: K, value: V): boolean {
    const node = this.lookup.get(key);
    if (node === undefined) {
      const newNode = {
        key,
        value,
        next: this.head,
        prev: null,
      };
      if (this.head) {
        this.head.prev = newNode;
      } else {
        this.tail = newNode;
      }
      this.head = newNode;
      this.lookup.set(key, newNode);

      if (this.lookup.size > this.capacity) {
        if (!this.tail || !this.tail.prev) {
          throw new Error('Invariant violation: over capacity with fewer than 2 items');
        }

        this.lookup.delete(this.tail.key);
        this.tail = this.tail.prev;
        this.tail.next = null;
      }
      return true;
    }

    this.get(key, undefined, false);
    node.value = value;
    return false;
  }

  /**
   * Fetches the item with the given key from the cache. If the item
   * is in the cache, and peek is not true, it is moved to the head
   * of the list. If the key is not in the cache, the default value
   * `def` is returned.
   *
   * @param key the key of the item to fetch
   * @param def the default value to return if the key is not in the cache
   * @param peek if true, the item is not moved to the head of the list
   */
  get(key: K, def?: V, peek?: boolean): V | undefined {
    const node = this.lookup.get(key);
    if (node === undefined) {
      return def;
    }

    if (peek) {
      return node.value;
    }

    /* Case 1: node is the head */
    if (node === this.head) {
      return node.value;
    }

    /* Case 2: there are at least two nodes, and the node is the tail */
    if (node === this.tail) {
      if (!this.tail.prev) {
        throw new Error('Invariant violation: tail.prev is null');
      }
      if (this.head === null) {
        throw new Error('Invariant violation: head is null');
      }

      this.tail = this.tail.prev;
      this.tail.next = null;
      node.prev = null;
      node.next = this.head;
      this.head.prev = node;
      this.head = node;

      return node.value;
    }

    /* Case 3: there are at least three nodes, and the node is in the middle */
    const prev = node.prev;
    const next = node.next;
    if (!prev || !next || !this.head) {
      throw new Error('Invariant violation: prev, next, or head is null');
    }

    prev.next = next;
    next.prev = prev;
    node.prev = null;
    node.next = this.head;
    this.head.prev = node;
    this.head = node;

    return node.value;
  }

  /**
   * Removes the given item from the cache, if it is in the cache.
   *
   * @param key the key of the item to remove
   * @returns true if the item was removed, false if it was not in the cache
   */
  remove(key: K): boolean {
    const node = this.lookup.get(key);
    if (node === undefined) {
      return false;
    }

    if (this.lookup.size === 1) {
      this.head = null;
      this.tail = null;
      this.lookup.delete(key);
      return true;
    }

    if (node === this.head) {
      if (!node.next) {
        throw new Error('Invariant violation: head.next is null');
      }
      this.head = node.next;
      this.head.prev = null;
      this.lookup.delete(key);
      return true;
    } else if (node === this.tail) {
      if (!node.prev) {
        throw new Error('Invariant violation: tail.prev is null');
      }
      this.tail = node.prev;
      this.tail.next = null;
      this.lookup.delete(key);
      return true;
    } else {
      if (!node.prev || !node.next) {
        throw new Error('Invariant violation: prev or next is null');
      }
      node.prev.next = node.next;
      node.next.prev = node.prev;
      this.lookup.delete(key);
      return true;
    }
  }
}

type LRUNode<K, V> = {
  key: K;
  value: V;
  next: LRUNode<K, V> | null;
  prev: LRUNode<K, V> | null;
};
