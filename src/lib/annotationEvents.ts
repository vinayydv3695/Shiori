/**
 * Coalesced "annotations changed" broadcast.
 *
 * Highlight/note/vocabulary saves each used to dispatch a window event
 * synchronously; with reader + sidebar both listening, every save triggered
 * two full DB fetches + DOM rescans. Multiple saves in one tick (e.g. a
 * rapid highlight sequence) fired N events. This helper coalesces to at most
 * one event per microtask so listeners run once per interaction batch.
 */
let pending = false;

const EVENT_NAME = 'annotation-changed';

/** Notify annotation listeners. Safe to call multiple times per tick. */
export function notifyAnnotationsChanged(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  });
}

/** Subscribe to annotation changes. Returns an unsubscribe function. */
export function onAnnotationsChanged(handler: () => void): () => void {
  const wrapped = () => handler();
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}