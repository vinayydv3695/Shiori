import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, DownloadCloud, Calendar, Star, BookHeart, Minus, Plus, Save, Loader2 } from 'lucide-react';
import { AnilistMediaList, AnilistMedia } from '@/lib/anilist';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface AniListMangaDetailsDialogProps {
  entry: AnilistMediaList | null;
  rawMedia?: AnilistMedia | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchOnlineManga: (title: string) => void;
  onSearchTorbox: (title: string) => void;
  onSave?: (mediaId: number, progress: number, status: string) => Promise<void>;
}

export function AniListMangaDetailsDialog({
  entry,
  rawMedia,
  isOpen,
  onOpenChange,
  onSearchOnlineManga,
  onSearchTorbox,
  onSave
}: AniListMangaDetailsDialogProps) {
  const manga = entry?.media || rawMedia;
  
  const [editProgress, setEditProgress] = useState(entry?.progress || 0);
  const [editStatus, setEditStatus] = useState(entry?.status || 'PLANNING');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditProgress(entry?.progress || 0);
      setEditStatus(entry?.status || 'PLANNING');
    }
  }, [isOpen, entry]);

  const handleSave = async () => {
    if (!onSave || !manga) return;
    setIsSaving(true);
    try {
      await onSave(manga.id, editProgress, editStatus);
    } finally {
      setIsSaving(false);
    }
  };

  if (!manga) return null;

  const title = manga.title.userPreferred || manga.title.english || manga.title.romaji;
  
  const formatDate = (dateObj?: { year: number | null, month: number | null, day: number | null }) => {
    if (!dateObj || !dateObj.year) return 'Unknown';
    return `${dateObj.year}-${String(dateObj.month || 1).padStart(2, '0')}-${String(dateObj.day || 1).padStart(2, '0')}`;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-all duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] border border-border bg-background/95 p-0 shadow-2xl backdrop-blur-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-2xl overflow-hidden ring-1 ring-white/5 flex flex-col max-h-[90vh]">
          
          {/* Blurred Background Header */}
          <div className="absolute top-0 left-0 right-0 h-72 w-full overflow-hidden pointer-events-none">
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-125 saturate-150 transition-all duration-700" 
              style={{ backgroundImage: `url(${manga.coverImage.extraLarge || manga.coverImage.large})` }} 
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background" />
          </div>

          <Dialog.Close className="absolute right-5 top-5 rounded-full bg-black/40 p-2.5 text-muted-foreground opacity-70 ring-offset-background transition-all duration-200 hover:opacity-100 hover:text-foreground hover:bg-black/80 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          <div className="relative z-10 px-6 sm:px-10 pt-12 pb-10 flex flex-col sm:flex-row gap-8 sm:gap-10 overflow-y-auto">
            
            {/* Left Column: Cover Image & Actions */}
            <div className="shrink-0 mx-auto sm:mx-0 flex flex-col gap-6 w-[180px] sm:w-[220px]">
              <div className="relative group perspective-1000">
                <div className="absolute -inset-2 bg-gradient-to-tr from-primary/30 to-purple-500/30 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <img 
                  src={manga.coverImage.extraLarge || manga.coverImage.large} 
                  alt={title}
                  className="relative w-full aspect-[2/3] rounded-xl shadow-2xl object-cover ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-[1.02]"
                />
                
                {/* Score Badge floating on cover */}
                {entry?.score && entry.score > 0 ? (
                  <div className="absolute -top-3 -right-3 bg-black/80 backdrop-blur-md border border-border text-white font-bold px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 shadow-xl">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> {entry.score}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full gap-2.5 shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-primary/40 hover:-translate-y-0.5 bg-gradient-to-r from-primary to-primary/80" 
                  onClick={() => {
                    onOpenChange(false);
                    onSearchOnlineManga(title);
                  }}
                >
                  <BookOpen className="w-4 h-4" /> Read Online
                </Button>
                <Button 
                  variant="secondary" 
                  className="w-full gap-2.5 bg-secondary/30 hover:bg-secondary/50 border border-border/50 text-foreground transition-all duration-300 hover:-translate-y-0.5 shadow-sm"
                  onClick={() => {
                    onOpenChange(false);
                    onSearchTorbox(title);
                  }}
                >
                  <DownloadCloud className="w-4 h-4 text-indigo-400" /> Download
                </Button>
              </div>
            </div>

            {/* Right Column: Details & Synopsis */}
            <div className="flex-1 flex flex-col pt-2 sm:pt-4 min-w-0">
              <div className="flex flex-wrap gap-2 text-xs font-semibold tracking-wider mb-3">
                <span className="bg-primary/20 text-primary-foreground border border-primary/30 px-2.5 py-1 rounded-md shadow-sm">
                  {(entry?.status || 'UNKNOWN').replace(/_/g, ' ')}
                </span>
                <span className="bg-secondary/30 border border-border px-2.5 py-1 rounded-md text-muted-foreground shadow-sm">
                  {manga.format}
                </span>
                {manga.status && (
                  <span className="bg-secondary/30 border border-border px-2.5 py-1 rounded-md text-muted-foreground shadow-sm">
                    {manga.status}
                  </span>
                )}
              </div>

              <Dialog.Title className="text-3xl sm:text-4xl font-extrabold leading-tight mb-6 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                {title}
              </Dialog.Title>

              {/* Edit Controls / Stats Grid */}
              <div className="grid grid-cols-2 gap-px bg-secondary/50 rounded-xl overflow-hidden shadow-inner mb-8 border border-border/50">
                <div className="bg-background/40 backdrop-blur-sm p-4 transition-colors">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <BookHeart className="w-3.5 h-3.5 text-rose-400" /> Progress
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditProgress(Math.max(0, editProgress - 1))} className="p-1 rounded bg-secondary/30 hover:bg-secondary/50 border border-border text-muted-foreground"><Minus className="w-3.5 h-3.5"/></button>
                    <input 
                      type="number" 
                      value={editProgress} 
                      onChange={e => setEditProgress(Math.max(0, Number(e.target.value)))} 
                      className="w-12 bg-transparent text-center font-semibold text-lg outline-none focus:bg-secondary/30 rounded" 
                    />
                    <button onClick={() => setEditProgress(editProgress + 1)} className="p-1 rounded bg-secondary/30 hover:bg-secondary/50 border border-border text-muted-foreground"><Plus className="w-3.5 h-3.5"/></button>
                    {manga.chapters ? <span className="text-sm font-medium text-muted-foreground ml-1">/ {manga.chapters}</span> : ''}
                  </div>
                </div>
                
                <div className="bg-background/40 backdrop-blur-sm p-4 transition-colors">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">
                    Status
                  </div>
                  <select 
                    value={editStatus} 
                    onChange={e => setEditStatus(e.target.value)} 
                    className="w-full bg-transparent font-medium text-foreground/90 outline-none p-1 -ml-1 rounded focus:bg-background/80"
                  >
                    <option className="bg-background text-foreground" value="CURRENT">Reading</option>
                    <option className="bg-background text-foreground" value="PLANNING">Planning</option>
                    <option className="bg-background text-foreground" value="COMPLETED">Completed</option>
                    <option className="bg-background text-foreground" value="DROPPED">Dropped</option>
                    <option className="bg-background text-foreground" value="PAUSED">Paused</option>
                  </select>
                </div>

                <div className="bg-background/40 backdrop-blur-sm p-3 col-span-2 flex justify-between items-center">
                  <div className="text-xs text-muted-foreground pl-1">
                    {entry ? `Started: ${formatDate(entry.startedAt)}` : 'Not in your list'}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={handleSave} 
                    disabled={isSaving || (entry?.progress === editProgress && entry?.status === editStatus)} 
                    className="h-8 bg-primary/20 hover:bg-primary/30 text-primary-foreground border border-primary/30"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </div>

              {manga.description && (
                <div className="flex-1 min-h-[120px] relative">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    Synopsis <div className="h-px bg-border flex-1" />
                  </h3>
                  <div className="relative h-full">
                    <div 
                      className="absolute inset-0 text-sm text-foreground/70 leading-relaxed overflow-y-auto pr-4 custom-scrollbar pb-6"
                      dangerouslySetInnerHTML={{ __html: manga.description }}
                    />
                    {/* Fade out at bottom of scroll container */}
                    <div className="absolute bottom-0 left-0 right-4 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
