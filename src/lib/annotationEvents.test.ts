import { describe, expect, it, vi } from 'vitest';
import { notifyAnnotationsChanged, onAnnotationsChanged } from './annotationEvents';

describe('annotationEvents', () => {
  it('dispatches at most one event per microtask for many saves', async () => {
    const listener = vi.fn();
    const unsubscribe = onAnnotationsChanged(listener);

    notifyAnnotationsChanged();
    notifyAnnotationsChanged();
    notifyAnnotationsChanged();

    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);

    // A later save dispatches again.
    notifyAnnotationsChanged();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('unsubscribe stops future events', async () => {
    const listener = vi.fn();
    const unsubscribe = onAnnotationsChanged(listener);
    unsubscribe();

    notifyAnnotationsChanged();
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });
});