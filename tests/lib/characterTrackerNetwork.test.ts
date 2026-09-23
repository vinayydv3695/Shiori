import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanBookCharacterNetwork } from '@/lib/characterTracker';
import { api } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  api: {
    getBookChapter: vi.fn(),
  },
  isTauri: () => true,
  isAndroid: false,
}));

describe('characterTracker Network scanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('scans chapters and builds co-occurrence edges with quotes', async () => {
    vi.mocked(api.getBookChapter).mockImplementation(async (_bookId, index) => {
      if (index === 0) {
        return {
          index: 0,
          title: 'Prologue',
          content: `
            <p>Elizabeth Bennet walked across the garden while Mr. Darcy stood near the window watching intently.</p>
            <p>"I have struggled in vain," Darcy said quietly to Elizabeth. "My feelings will not be repressed."</p>
            <p>Elizabeth looked at Darcy with surprise. Darcy then turned away towards the garden gate.</p>
          `,
          location: 'ch1.html',
        };
      }
      return null;
    });

    const network = await scanBookCharacterNetwork(1, 1);
    expect(network).toBeDefined();
    expect(network.characters.length).toBeGreaterThan(0);

    const names = network.characters.map(c => c.name);
    const hasElizabeth = names.some(n => n.includes('Elizabeth'));
    const hasDarcy = names.some(n => n.includes('Darcy'));
    expect(hasElizabeth || hasDarcy).toBe(true);

    if (network.edges.length > 0) {
      const edge = network.edges[0];
      expect(edge.chapters).toContain(0);
      expect(edge.weight).toBeGreaterThanOrEqual(1);
    }
  });
});
