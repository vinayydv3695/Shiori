import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Action log — a privacy-scoped, opt-in diagnostic trail of what the user did
 * and how the app responded. It is:
 *   • OFF by default and controlled by a single toggle (see the Privacy & Data
 *     settings section);
 *   • bounded to a rolling 10-minute window — anything older is dropped;
 *   • downloadable as a plain .txt file, but only once the toggle has been on
 *     for at least 1 minute (so there is meaningful content to save).
 *
 * The buffer lives in memory and is mirrored to localStorage (debounced) so it
 * survives a reload within the retention window. Only the enabled flag and the
 * timestamp the toggle was switched on are kept in the persisted zustand state.
 *
 * Privacy: we deliberately record element LABELS for clicks (never the values
 * typed into inputs) and the app's own log/toast messages. No field contents,
 * credentials, or search text are captured.
 */

export interface ActionLogEntry {
  /** Epoch milliseconds. */
  t: number;
  /** Coarse source/category, e.g. 'user', 'info', 'warn', 'error', 'app'. */
  category: string;
  message: string;
}

/** Rolling retention window: only the last 10 minutes are kept. */
export const ACTION_LOG_RETENTION_MS = 10 * 60 * 1000;
/** Minimum time the toggle must be on before the log can be downloaded. */
export const ACTION_LOG_MIN_DOWNLOAD_MS = 60 * 1000;
/** Hard cap on retained entries so a burst can't grow memory without bound. */
const MAX_ENTRIES = 4000;
/** Truncate individual messages so one huge payload can't bloat the log. */
const MAX_MESSAGE_LEN = 600;

const BUFFER_KEY = 'shiori-action-log-buffer';

// The entry buffer is kept OUTSIDE zustand state on purpose: entries can arrive
// many times per second and pushing each through React state would thrash every
// subscriber. The UI reads it on demand (download) and derives the download-gate
// purely from `enabled` + `enabledAt`.
let buffer: ActionLogEntry[] = [];

// ── localStorage mirror (best-effort, never throws into callers) ─────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function writeBufferToStorage(): void {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    // Quota / private-mode / disabled storage — the in-memory buffer still works.
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeBufferToStorage();
  }, 3000);
}

function clearStorage(): void {
  try {
    localStorage.removeItem(BUFFER_KEY);
  } catch {
    // ignore
  }
}

function loadBufferFromStorage(): void {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      buffer = parsed.filter(
        (e): e is ActionLogEntry =>
          e && typeof e.t === 'number' && typeof e.message === 'string'
      );
      prune();
    }
  } catch {
    buffer = [];
  }
}

// ── Buffer maintenance ───────────────────────────────────────────────────────

function prune(now: number = Date.now()): void {
  const cutoff = now - ACTION_LOG_RETENTION_MS;
  // Entries are appended in time order, so drop the stale prefix in one splice.
  let drop = 0;
  while (drop < buffer.length && buffer[drop].t < cutoff) drop++;
  if (drop > 0) buffer.splice(0, drop);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

// ── Store ────────────────────────────────────────────────────────────────────

interface ActionLogState {
  /** Whether actions are currently being recorded and retained. */
  enabled: boolean;
  /** Epoch ms the toggle was switched on (null when disabled). */
  enabledAt: number | null;
  setEnabled: (value: boolean) => void;
}

export const useActionLogStore = create<ActionLogState>()(
  persist(
    (set) => ({
      enabled: false,
      enabledAt: null,
      setEnabled: (value: boolean) => {
        if (value) {
          // Fresh window: clear any stale buffer so `enabledAt` and the 1-minute
          // download gate line up with the data actually captured.
          buffer = [];
          clearStorage();
          const now = Date.now();
          set({ enabled: true, enabledAt: now });
          buffer.push({ t: now, category: 'app', message: 'Action logging enabled' });
          writeBufferToStorage();
        } else {
          buffer = [];
          clearStorage();
          set({ enabled: false, enabledAt: null });
        }
      },
    }),
    {
      name: 'shiori-action-log',
      partialize: (state) => ({ enabled: state.enabled, enabledAt: state.enabledAt }),
    }
  )
);

// ── Recording API ──────────────────────────────────────────────────────────

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

/**
 * Append one action-log entry. No-op unless logging is enabled. Safe to call at
 * high frequency — pruning and persistence are cheap/debounced.
 */
export function recordAction(category: string, ...args: unknown[]): void {
  if (!useActionLogStore.getState().enabled) return;
  let message = args.map(stringifyArg).join(' ');
  if (message.length > MAX_MESSAGE_LEN) {
    message = `${message.slice(0, MAX_MESSAGE_LEN)}…`;
  }
  buffer.push({ t: Date.now(), category, message });
  prune();
  schedulePersist();
}

/** Snapshot of the current (pruned) entries. */
export function getActionLogEntries(): ActionLogEntry[] {
  prune();
  return buffer.slice();
}

function fmtTimestamp(t: number): string {
  const d = new Date(t);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

/** Render the retained entries as a downloadable plain-text report. */
export function buildActionLogText(): string {
  const entries = getActionLogEntries();
  const now = Date.now();
  const header = [
    'Shiori Action Log',
    `Generated: ${fmtTimestamp(now)}`,
    `Retention window: last ${ACTION_LOG_RETENTION_MS / 60000} minutes`,
    `Entries: ${entries.length}`,
    'Note: records user actions (element labels only) and app responses.',
    'No input values, credentials, or search text are captured.',
    '='.repeat(60),
    '',
  ].join('\n');

  if (entries.length === 0) {
    return `${header}(no actions recorded yet)\n`;
  }

  const body = entries
    .map((e) => `${fmtTimestamp(e.t)}  [${e.category.toUpperCase()}]  ${e.message}`)
    .join('\n');
  return `${header}${body}\n`;
}

// ── User-action capture (global, opt-in) ─────────────────────────────────────

/** Best-effort accessible label for a clicked element (never its value). */
function describeElement(el: Element): string | null {
  const actionable = el.closest(
    'button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="checkbox"], input[type="radio"], label, select'
  );
  if (!actionable) return null;

  const aria = actionable.getAttribute('aria-label');
  const title = actionable.getAttribute('title');
  let label = (aria || title || actionable.textContent || '').replace(/\s+/g, ' ').trim();
  if (!label) {
    const role = actionable.getAttribute('role') || actionable.tagName.toLowerCase();
    label = `<${role}>`;
  }
  if (label.length > 80) label = `${label.slice(0, 80)}…`;
  return label;
}

let listenersAttached = false;

/** Attach the global click listener once. Cheap when logging is disabled. */
function attachGlobalListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  window.addEventListener(
    'click',
    (e) => {
      if (!useActionLogStore.getState().enabled) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const label = describeElement(target);
      if (label) recordAction('user', `Click: ${label}`);
    },
    { capture: true, passive: true }
  );

  // Flush the buffer on unload so a reload within the window keeps recent data.
  window.addEventListener('beforeunload', () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    writeBufferToStorage();
  });
}

// Restore any persisted buffer and wire up capture as soon as the module loads.
// `logger` imports this module, so it is evaluated very early in app startup.
loadBufferFromStorage();
attachGlobalListeners();
