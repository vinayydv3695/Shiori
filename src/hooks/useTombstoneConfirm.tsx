import { useCallback, useRef, useState, type ReactNode } from 'react';
import { TombstoneConfirmDialog } from '@/components/library/TombstoneConfirmDialog';

interface TombstoneConfirmApi {
  /** Ask the user about a set of previously-deleted paths. Resolves true if they chose "Import anyway". */
  confirmTombstones: (paths: string[]) => Promise<boolean>;
  /** Dismiss any open tombstone confirm (resolves false). Safe to call when no dialog is open. */
  dismissTombstoneConfirm: () => void;
  /** Mount this once in the component's JSX. */
  tombstoneDialog: ReactNode;
}

/**
 * Promise-based wrapper around `TombstoneConfirmDialog` — call `confirmTombstones(paths)`
 * and `await` the boolean result, no state plumbing needed.
 */
export function useTombstoneConfirm(): TombstoneConfirmApi {
  const [paths, setPaths] = useState<string[] | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const resolve = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setPaths(null);
  }, []);

  const confirmTombstones = useCallback((nextPaths: string[]) => {
    setPaths(nextPaths);
    return new Promise<boolean>((resolvePromise) => {
      resolverRef.current = resolvePromise;
    });
  }, []);

  const dismissTombstoneConfirm = useCallback(() => {
    resolve(false);
  }, [resolve]);

  const tombstoneDialog =
    paths && paths.length > 0 ? (
      <TombstoneConfirmDialog
        paths={paths}
        onConfirm={() => resolve(true)}
        onCancel={() => resolve(false)}
      />
    ) : null;

  return { confirmTombstones, dismissTombstoneConfirm, tombstoneDialog };
}
