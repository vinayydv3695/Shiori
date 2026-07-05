import re

with open('src/components/library/SeriesView.tsx', 'r') as f:
    content = f.read()

header_pattern = r"(<div className=\"relative overflow-hidden shrink-0 border-b border-border bg-card\">)(.*?)(<div className=\"flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-b border-border bg-card/80 backdrop-blur-md shrink-0 sticky top-0 z-20 shadow-sm\">)"
match = re.search(header_pattern, content, re.DOTALL)
if not match:
    print("Could not find SeriesHeader block")
    exit(1)

new_header = """<div className="relative overflow-hidden shrink-0 border-b border-border bg-card">
      {/* Blurred Hero Background */}
      {coverUrl && (
        <>
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30 blur-3xl scale-110 saturate-150 transform-gpu dark:opacity-40"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
        </>
      )}

      <div className="relative z-10 p-4 pt-12 md:p-8 flex flex-col gap-6 md:gap-8">
        
        {/* Top Section: Cover & Info */}
        <div className="flex flex-row gap-4 md:gap-8 items-start md:items-end w-full">
          {/* Cover */}
          <div className="w-28 h-40 md:w-48 md:h-72 rounded-lg overflow-hidden shadow-2xl border border-white/10 flex-shrink-0 bg-muted/50 transform transition-transform hover:scale-105 duration-300">
            {coverUrl ? (
              <img src={coverUrl} alt={series.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30 bg-muted">
                <BookOpen className="w-8 h-8 md:w-12 md:h-12 mb-2" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-start md:justify-end py-1 md:py-2 w-full text-left">
            <div className="flex flex-wrap items-center gap-2 mb-2 md:mb-3">
              <span className="px-2 py-0.5 md:px-2.5 md:py-1 rounded text-[10px] md:text-xs font-bold tracking-wider bg-primary text-primary-foreground shadow-sm uppercase">
                {status}
              </span>
              <span className="text-xs md:text-sm text-foreground/90 font-medium flex items-center gap-1 backdrop-blur-md bg-background/30 px-2 py-0.5 md:px-2.5 md:py-1 rounded border border-border/20">
                <Layers className="w-3 h-3 md:w-4 md:h-4" />
                {series.bookCount} {series.bookCount === 1 ? 'Vol' : 'Vols'}
              </span>
              {totalPages > 0 && (
                <span className="hidden md:flex text-sm text-foreground/90 font-medium items-center gap-1 backdrop-blur-md bg-background/30 px-2.5 py-1 rounded border border-border/20">
                  <BookOpen className="w-4 h-4" />
                  {totalPages.toLocaleString()} Pages
                </span>
              )}
            </div>
            
            <Dialog.Title className="text-2xl sm:text-3xl md:text-5xl font-black text-foreground line-clamp-3 md:truncate tracking-tight mb-1 md:mb-2 drop-shadow-md leading-tight">
              {series.title}
            </Dialog.Title>
            <p className="text-sm md:text-xl text-foreground/80 truncate font-medium drop-shadow-sm">
              {Array.from(series.authors).join(', ') || 'Unknown Author'}
            </p>
          </div>
        </div>

        {/* Actions Section */}
        <div className="flex flex-col md:flex-row items-center gap-5 md:gap-6 w-full">
          {/* Primary Action */}
          <div className="w-full md:w-auto md:flex-none">
            <Button 
              size="lg" 
              onClick={() => {
                if (nextUnreadBook?.id) onOpenBook(nextUnreadBook.id);
                else if (sortedBooks[0]?.id) onOpenBook(sortedBooks[0].id);
              }} 
              className="w-full gap-2.5 font-bold text-base shadow-lg shadow-primary/20 transition-all hover:scale-105"
            >
              <Play className="w-5 h-5 fill-current" /> 
              {nextUnreadBook ? `Continue Vol. ${nextUnreadBook.series_index || ''}` : 'Read Again'}
            </Button>
          </div>

          {/* Reading Progress */}
          <div className="flex-1 flex flex-col justify-center w-full max-w-sm md:mx-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] md:text-xs font-bold text-foreground/80 uppercase tracking-wider drop-shadow-sm">Reading Progress</span>
              <span className="text-[10px] md:text-xs font-black text-primary drop-shadow-sm">{progressPercent}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-background/40 backdrop-blur-sm rounded-full overflow-hidden border border-border/30 shadow-inner">
              <div className="h-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Secondary Actions (Dropdown) */}
          <div className="flex items-center gap-2 justify-center w-full md:w-auto md:justify-end mt-2 md:mt-0">
            <Button variant="secondary" size="icon" onClick={onMarkAllRead} className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md transition-colors shadow-sm" title="Mark All Read">
              <CheckCircle2 className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon" disabled className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md opacity-50 cursor-not-allowed shadow-sm" title="Download">
              <DownloadCloud className="w-4 h-4" />
            </Button>
            
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" size="icon" className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md transition-colors shadow-sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="w-48 bg-card border border-border/50 rounded-lg shadow-xl p-1 z-[100] animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2">
                  <DropdownMenu.Item onSelect={onFindMetadata} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
                    <Edit2 className="w-4 h-4" /> Edit Metadata
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-border/50 my-1" />
                  {!showDeleteConfirm ? (
                    <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} className="flex items-center gap-2 px-3 py-2 text-sm text-destructive cursor-pointer outline-none hover:bg-destructive/10 rounded-md transition-colors font-medium">
                      <Trash2 className="w-4 h-4" /> Ungroup Series
                    </DropdownMenu.Item>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-destructive/10 rounded-md">
                      <span className="text-xs text-destructive font-bold px-1">Sure?</span>
                      <div className="flex gap-1">
                        <Button variant="destructive" size="sm" onClick={onDelete} className="h-6 text-[10px] px-2 py-0">Yes</Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-6 text-[10px] px-2 py-0 hover:bg-destructive/20 text-destructive">No</Button>
                      </div>
                    </div>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    </div>
"""

content = content[:match.start(2)] + "\n" + new_header + "\n" + content[match.end(2):]

with open('src/components/library/SeriesView.tsx', 'w') as f:
    f.write(content)
