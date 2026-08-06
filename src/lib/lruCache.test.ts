import { describe, it, expect } from 'vitest';
import { lruGet, lruSet } from './lruCache';

describe('lruSet', () => {
  it('inserts values and evicts the oldest past maxSize', () => {
    const map = new Map<number, string>();
    lruSet(map, 1, 'a', 3);
    lruSet(map, 2, 'b', 3);
    lruSet(map, 3, 'c', 3);
    expect(map.size).toBe(3);

    // 4th insert evicts the oldest (1)
    lruSet(map, 4, 'd', 3);
    expect(map.has(1)).toBe(false);
    expect([...map.values()]).toEqual(['b', 'c', 'd']);
  });

  it('overwrites in place without growing the map', () => {
    const map = new Map<number, string>();
    lruSet(map, 1, 'a', 3);
    lruSet(map, 1, 'a2', 3);
    expect(map.size).toBe(1);
    expect(map.get(1)).toBe('a2');
  });

  it('handles null values (cached "no cover" markers)', () => {
    const map = new Map<number, string | null>();
    lruSet(map, 1, null, 2);
    lruSet(map, 2, 'x', 2);
    expect(map.get(1)).toBeNull();
    expect(map.size).toBe(2);
  });
});

describe('lruGet', () => {
  it('returns undefined for a missing key', () => {
    expect(lruGet(new Map(), 'nope')).toBeUndefined();
  });

  it('returns the value and refreshes recency', () => {
    const map = new Map<number, string>();
    lruSet(map, 1, 'a', 3);
    lruSet(map, 2, 'b', 3);
    lruSet(map, 3, 'c', 3);

    // Touch 1 — it becomes the newest
    expect(lruGet(map, 1)).toBe('a');

    // Inserting 4 now evicts 2 (oldest), not 1
    lruSet(map, 4, 'd', 3);
    expect(map.has(1)).toBe(true);
    expect(map.has(2)).toBe(false);
  });

  it('distinguishes a cached null from a miss', () => {
    const map = new Map<number, string | null>();
    lruSet(map, 1, null, 2);
    expect(lruGet(map, 1)).toBeNull();
    expect(lruGet(map, 2)).toBeUndefined();
  });
});
