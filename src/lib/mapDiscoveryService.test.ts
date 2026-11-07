import { describe, it, expect } from 'vitest';
import {
  extractFranchiseKey,
  normalizeMapImageUrl,
  generateProceduralRealmMap,
  searchOnlineBookMaps,
} from './mapDiscoveryService';

describe('mapDiscoveryService', () => {
  it('identifies franchise key for Re:ZERO and Middle-earth', () => {
    expect(
      extractFranchiseKey('Re:ZERO Starting Life in Another World Short Story Collection, Vol. 4')
    ).toBe('rezero');
    expect(extractFranchiseKey('The Lord of the Rings: The Fellowship of the Ring')).toBe('lotr');
    expect(extractFranchiseKey('Dune Messiah')).toBe('dune');
    expect(extractFranchiseKey('A Game of Thrones')).toBe('asoiaf');
  });

  it('normalizes local file paths and http urls', () => {
    expect(normalizeMapImageUrl('https://example.com/map.jpg')).toBe('https://example.com/map.jpg');
    expect(normalizeMapImageUrl('data:image/svg+xml;utf8,...')).toContain('data:image');
    // Local path normalization converts via convertFileSrc
    const local = normalizeMapImageUrl('/home/zura/rezero.png');
    expect(local).toBeTruthy();
  });

  it('finds curated world map for Re:ZERO', async () => {
    const maps = await searchOnlineBookMaps(
      'Re:ZERO Starting Life in Another World Short Story Collection, Vol. 4'
    );
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0].title).toContain('Re:ZERO');
    expect(maps[0].imageUrl).toContain('wikia.nocookie.net');
  }, 15000);

  it('generates a procedural fantasy realm map SVG with landmarks', () => {
    const generated = generateProceduralRealmMap('Re:ZERO Starting Life in Another World');
    expect(generated.title).toContain('Re:ZERO');
    expect(generated.imageUrl).toContain('data:image/svg+xml');
    expect(generated.defaultPins.length).toBeGreaterThan(0);
    expect(generated.defaultPins[0].label).toBeTruthy();
  });
});
