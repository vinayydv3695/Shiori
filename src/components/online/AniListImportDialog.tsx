import React, { useState, useMemo, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, DownloadCloud, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnilistMediaListCollection, AnilistMediaList } from '@/lib/anilist';
import { invoke } from '@tauri-apps/api/core';
import { api } from '@/lib/tauri';
import { pluginApi } from '@/lib/pluginSources';
import { toast } from '@/store/toastStore';

interface AniListImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  collection: AnilistMediaListCollection | null;
  anilistToken: string | null;
}

export function AniListImportDialog({ isOpen, onClose, collection, anilistToken }: AniListImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [statusText, setStatusText] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setIsImporting(false);
      setProgress({ current: 0, total: 0, successes: 0, failures: 0 });
      setStatusText('');
    }
  }, [isOpen]);

  const eligibleEntries = useMemo(() => {
    if (!collection) return [];
    
    let entries: { entry: AnilistMediaList, status: string }[] = [];
    
    for (const list of collection.lists) {
      if (list.name === 'Reading' || list.name === 'Planning') {
        const shioriStatus = list.name === 'Reading' ? 'reading' : 'planning';
        const listEntries = list.entries.map(e => ({ entry: e, status: shioriStatus }));
        entries = entries.concat(listEntries);
      }
    }
    
    return entries.sort((a, b) => {
      const titleA = a.entry.media.title.romaji || a.entry.media.title.english || '';
      const titleB = b.entry.media.title.romaji || b.entry.media.title.english || '';
      return titleA.localeCompare(titleB);
    });
  }, [collection]);

  const handleStartImport = async () => {
    if (eligibleEntries.length === 0) return;
    
    setIsImporting(true);
    setProgress(p => ({ ...p, total: eligibleEntries.length, current: 0 }));
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < eligibleEntries.length; i++) {
      const { entry, status } = eligibleEntries[i];
      const title = entry.media.title.romaji || entry.media.title.english || entry.media.title.native;
      
      setStatusText(`Searching for "${title}"...`);
      setProgress(p => ({ ...p, current: i + 1 }));
      
      try {
        const searchResults = await pluginApi.search('mangafire', title, 1);
        
        if (searchResults && searchResults.length > 0) {
          const match = searchResults[0];
          setStatusText(`Adding "${title}"...`);
          
          await api.addBook({
            uuid: crypto.randomUUID(),
            title: entry.media.title.userPreferred || title,
            file_path: `online-manga://mangafire/${match.id}`, 
            file_format: 'online-manga',
            cover_path: entry.media.coverImage?.large || entry.media.coverImage?.medium || match.cover_url || match.coverUrl,
            domain: 'manga',
            reading_status: status,
            anilist_id: entry.media.id.toString(),
            notes: entry.media.description,
            added_date: new Date().toISOString(),
            modified_date: new Date().toISOString(),
            language: 'en',
            is_favorite: false
          });
          successCount++;
        } else {
          console.warn(`No mangafire match for ${title}`);
          failCount++;
        }
      } catch (err) {
        toast.error(`Error importing ${title}`);
        failCount++;
      }
      
      setProgress(p => ({ ...p, successes: successCount, failures: failCount }));
      await new Promise(r => setTimeout(r, 800));
    }
    
    setStatusText(`Import complete! ${successCount} successful, ${failCount} skipped.`);
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isImporting && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-xl">
          
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-primary" />
              Import AniList Manga
            </Dialog.Title>
            <Dialog.Close disabled={isImporting} className="rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4 py-4">
            {!isImporting ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Found <strong className="text-foreground">{eligibleEntries.length}</strong> manga in your "Planning" and "Reading" lists.
                </p>
                <div className="bg-muted/50 rounded-lg p-3 border border-border/50 max-h-[250px] overflow-y-auto space-y-2">
                  {eligibleEntries.length > 0 ? (
                    eligibleEntries.map((item) => (
                      <div key={item.entry.media.id} className="flex items-center justify-between text-sm">
                        <span className="truncate pr-4 flex-1">
                          {item.entry.media.title.userPreferred || item.entry.media.title.english}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-background border border-border capitalize whitespace-nowrap text-muted-foreground">
                          {item.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-4">
                      No eligible manga found in those lists.
                    </div>
                  )}
                </div>
                
                <div className="flex items-start gap-3 mt-4 text-sm text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/20">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p>
                    This will automatically search Mangafire for these titles and add them to your local Manga Library as online reading sources.
                  </p>
                </div>
              </>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-6">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      className="text-muted/20 stroke-current"
                      strokeWidth="8"
                      cx="50" cy="50" r="40" fill="transparent"
                    ></circle>
                    <circle
                      className="text-primary stroke-current transition-all duration-300 ease-in-out"
                      strokeWidth="8"
                      strokeLinecap="round"
                      cx="50" cy="50" r="40" fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * (progress.current / progress.total))}
                    ></circle>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-lg font-semibold">
                    {progress.current}/{progress.total}
                  </div>
                </div>
                
                <div className="text-center space-y-1 w-full px-4">
                  <p className="text-sm font-medium text-foreground truncate">{statusText}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-3">
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {progress.successes} Added
                    </span>
                    <span className="text-red-400 flex items-center gap-1">
                      <X className="w-3 h-3" /> {progress.failures} Skipped
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
            <Button variant="ghost" onClick={onClose} disabled={isImporting}>
              Cancel
            </Button>
            {!isImporting && (
              <Button onClick={handleStartImport} disabled={eligibleEntries.length === 0} className="gap-2">
                <DownloadCloud className="w-4 h-4" />
                Import to Library
              </Button>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
