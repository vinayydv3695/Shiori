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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100vw-2rem)] sm:max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/50 bg-background/95 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-3xl min-w-0">
          
          <div className="flex items-center justify-between pb-1 min-w-0">
            <Dialog.Title className="text-xl font-bold tracking-tight text-foreground flex items-center gap-3 min-w-0">
              <div className="p-2 bg-primary/10 rounded-xl text-primary shrink-0">
                <DownloadCloud className="w-5 h-5" />
              </div>
              <span className="truncate">Import AniList</span>
            </Dialog.Title>
            <Dialog.Close disabled={isImporting} className="rounded-full p-2 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all disabled:opacity-30 shrink-0 ml-2">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4 py-4 min-w-0">
            {!isImporting ? (
              <>
                <p className="text-sm text-muted-foreground px-1">
                  Found <strong className="text-foreground">{eligibleEntries.length}</strong> manga in your "Planning" and "Reading" lists.
                </p>
                <div className="bg-secondary/30 backdrop-blur-sm rounded-2xl p-4 border border-border/40 max-h-[40vh] sm:max-h-[300px] overflow-y-auto space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-w-0">
                  {eligibleEntries.length > 0 ? (
                    eligibleEntries.map((item) => (
                      <div key={item.entry.media.id} className="flex items-center justify-between text-sm group min-w-0 gap-2">
                        <span className="truncate flex-1 font-medium text-foreground/90 group-hover:text-foreground transition-colors min-w-0">
                          {item.entry.media.title.userPreferred || item.entry.media.title.english}
                        </span>
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-background/80 border border-border/50 capitalize whitespace-nowrap text-muted-foreground shadow-sm shrink-0">
                          {item.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-8 flex flex-col items-center gap-2">
                      <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                      No eligible manga found.
                    </div>
                  )}
                </div>
                
                <div className="flex items-start gap-3 mt-4 text-sm text-muted-foreground bg-primary/10 p-4 rounded-2xl border border-primary/20">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-primary/90">
                    This will automatically search Mangafire for these titles and add them to your local library as online sources.
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

          <div className="flex items-center justify-end gap-3 pt-5 border-t border-border/30">
            <Button variant="ghost" onClick={onClose} disabled={isImporting} className="rounded-xl px-5 hover:bg-secondary/60">
              Cancel
            </Button>
            {!isImporting && (
              <Button onClick={handleStartImport} disabled={eligibleEntries.length === 0} className="gap-2 rounded-xl px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
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
