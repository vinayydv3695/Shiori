import { describe, it, expect, beforeEach } from 'vitest';
import { useDoodleStore, type DoodleStroke } from '@/store/doodleStore';

describe('useDoodleStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useDoodleStore.setState({
      isDoodleMode: false,
      tool: 'pen',
      penColor: '#1A1A2E',
      penWidth: 3,
      activePageId: null,
      strokesMap: {},
      undoStackMap: {},
      redoStackMap: {},
      isDirtyMap: {},
    });
  });

  it('preserves strokes in strokesMap when exiting and re-entering doodle mode', () => {
    const pageId = 'chapter_0';
    useDoodleStore.getState().setDoodleMode(true);
    expect(useDoodleStore.getState().isDoodleMode).toBe(true);

    const stroke: DoodleStroke = {
      id: 'stroke-1',
      tool: 'pen',
      color: '#1A1A2E',
      width: 3,
      points: [[10, 10, 0.5], [20, 20, 0.5]],
      timestamp: Date.now(),
    };

    useDoodleStore.getState().addStroke(pageId, stroke);

    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(1);
    expect(useDoodleStore.getState().isDirtyMap[pageId]).toBe(true);

    // User exits doodle mode (clicks Done)
    useDoodleStore.getState().setDoodleMode(false);
    expect(useDoodleStore.getState().isDoodleMode).toBe(false);

    // Strokes must STILL be present in the store so they render on the page!
    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(1);
    expect(useDoodleStore.getState().strokesMap[pageId][0].id).toBe('stroke-1');

    // User re-enters doodle mode
    useDoodleStore.getState().setDoodleMode(true);
    expect(useDoodleStore.getState().isDoodleMode).toBe(true);
    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(1);
  });

  it('supports undo and redo per page', () => {
    const pageId = 'chapter_1';
    const stroke1: DoodleStroke = {
      id: 's1',
      tool: 'pen',
      color: '#E74C3C',
      width: 4,
      points: [[0, 0, 0.5], [10, 10, 0.5]],
      timestamp: Date.now(),
    };
    const stroke2: DoodleStroke = {
      id: 's2',
      tool: 'pen',
      color: '#3498DB',
      width: 2,
      points: [[20, 20, 0.5], [30, 30, 0.5]],
      timestamp: Date.now(),
    };

    useDoodleStore.getState().addStroke(pageId, stroke1);
    useDoodleStore.getState().addStroke(pageId, stroke2);
    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(2);

    // Undo
    useDoodleStore.getState().undo(pageId);
    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(1);
    expect(useDoodleStore.getState().strokesMap[pageId][0].id).toBe('s1');

    // Redo
    useDoodleStore.getState().redo(pageId);
    expect(useDoodleStore.getState().strokesMap[pageId]).toHaveLength(2);
    expect(useDoodleStore.getState().strokesMap[pageId][1].id).toBe('s2');
  });

  it('isolates strokes across different pages', () => {
    const pageA = 'chapter_0';
    const pageB = 'chapter_1';

    const strokeA: DoodleStroke = {
      id: 'stroke-A',
      tool: 'pen',
      color: '#000',
      width: 2,
      points: [[5, 5, 0.5]],
      timestamp: Date.now(),
    };
    const strokeB: DoodleStroke = {
      id: 'stroke-B',
      tool: 'pen',
      color: '#FFF',
      width: 5,
      points: [[50, 50, 0.5]],
      timestamp: Date.now(),
    };

    useDoodleStore.getState().addStroke(pageA, strokeA);
    useDoodleStore.getState().addStroke(pageB, strokeB);

    expect(useDoodleStore.getState().strokesMap[pageA]).toHaveLength(1);
    expect(useDoodleStore.getState().strokesMap[pageB]).toHaveLength(1);
    expect(useDoodleStore.getState().strokesMap[pageA][0].id).toBe('stroke-A');
    expect(useDoodleStore.getState().strokesMap[pageB][0].id).toBe('stroke-B');
  });

  it('marks clean after saving', () => {
    const pageId = 'chapter_2';
    useDoodleStore.getState().addStroke(pageId, {
      id: 's-clean',
      tool: 'pen',
      color: '#000',
      width: 2,
      points: [[0, 0, 0.5]],
      timestamp: Date.now(),
    });

    expect(useDoodleStore.getState().isDirtyMap[pageId]).toBe(true);

    useDoodleStore.getState().markClean(pageId);
    expect(useDoodleStore.getState().isDirtyMap[pageId]).toBe(false);
  });
});
