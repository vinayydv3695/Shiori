import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface LibraryHealthReport {
  checked: number;
  skipped: number;
  missing: { id: number; title: string; filePath: string }[];
  unreadable: { id: number; title: string; filePath: string; reason: string }[];
}

const LIMIT = 100;

export function LibraryHealthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [report, setReport] = useState<LibraryHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    setError(null);
    try {
      setReport(await invoke<LibraryHealthReport>('check_library_health'));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open && !report && !loading && !error) void check(); }, [open, report, loading, error]);

  const issues = report ? [...report.missing.map(item => ({ ...item, kind: 'Missing file', reason: '' })), ...report.unreadable.map(item => ({ ...item, kind: 'Unreadable file', reason: item.reason }))] : [];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Library health</DialogTitle>
        <DialogDescription>Check which library files are available. This is read-only; nothing will be deleted or changed.</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status">Checking library…</p> : null}
      {error ? <div role="alert" className="space-y-3"><p>Couldn’t check library health: {error}</p><Button onClick={() => void check()}>Retry</Button></div> : null}
      {report ? <div className="space-y-4">
        <p>{report.checked} checked · {report.skipped} skipped · {report.missing.length} missing · {report.unreadable.length} unreadable</p>
        {issues.length === 0 ? <p>All checked files are available.</p> : <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="Library health issues">
          {issues.slice(0, LIMIT).map((item, i) => <li key={`${item.id}-${i}`} className="break-words rounded-md border p-3"><strong>{item.kind}: {item.title}</strong><p className="text-sm text-muted-foreground">{item.filePath}{item.reason ? ` — ${item.reason}` : ''}</p></li>)}
        </ul>}
        {issues.length > LIMIT ? <p>Showing the first {LIMIT} of {issues.length} issues.</p> : null}
        {report.skipped > 0 ? <p className="text-sm text-muted-foreground">Some files were skipped because they can’t be checked on this device.</p> : null}
        <Button variant="outline" onClick={() => void check()} disabled={loading}>Check again</Button>
      </div> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
