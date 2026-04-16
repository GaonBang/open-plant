import type { CachedTile } from "./wsi-renderer-types";

interface LruNode {
  key: string;
  value: CachedTile;
  prev: LruNode | null;
  next: LruNode | null;
}

/**
 * Map-compatible LRU cache for CachedTile.
 * Provides O(1) get, set, delete, and eviction of the least-recently-used entry.
 */
export class TileLruCache {
  private readonly map = new Map<string, LruNode>();
  private head: LruNode | null = null;
  private tail: LruNode | null = null;

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): CachedTile | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: CachedTile): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }
    const node: LruNode = { key, value, prev: null, next: null };
    this.map.set(key, node);
    this.addToHead(node);
  }

  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    return true;
  }

  /** Remove and return the least-recently-used entry. Returns null if empty. */
  evictLru(): CachedTile | null {
    if (!this.tail) return null;
    const lru = this.tail;
    this.removeNode(lru);
    this.map.delete(lru.key);
    return lru.value;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  *[Symbol.iterator](): Iterator<[string, CachedTile]> {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  private addToHead(node: LruNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LruNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LruNode): void {
    if (this.head === node) return;
    this.removeNode(node);
    this.addToHead(node);
  }
}
