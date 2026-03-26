import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import type { SourceKind } from '@/store/sourceStore';

interface OnlineSearchHeaderProps {
  kind: SourceKind;
  title: string;
  subtitle: string;
  searchValue: string;
  loading: boolean;
  disabled: boolean;
  disabledMessage?: string;
  onSearchValueChange: (value: string) => void;
  onSubmit: () => void;
}

export function OnlineSearchHeader({
  kind,
  title,
  subtitle,
  searchValue,
  loading,
  disabled,
  disabledMessage,
  onSearchValueChange,
  onSubmit,
}: OnlineSearchHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-border bg-muted/30 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <OnlineSourceSelector kind={kind} />
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
              placeholder={kind === 'books' ? 'Search by title, author, ISBN...' : 'Search manga by title...'}
              className="pl-10"
              disabled={disabled}
            />
          </div>
          <Button onClick={onSubmit} disabled={loading || !searchValue.trim() || disabled}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {disabled && disabledMessage && (
          <div className="p-3 rounded-lg bg-muted border border-border text-sm text-muted-foreground">
            {disabledMessage}
          </div>
        )}
      </div>
    </div>
  );
}
