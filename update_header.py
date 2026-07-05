import re

with open('src/components/online/OnlineSearchHeader.tsx', 'r') as f:
    content = f.read()

# I will replace the main return block.
# Let's find the start of the return statement and replace it.

pattern = r'  return \(\n    <div className="flex-shrink-0 bg-background/60.*?  \);\n}'

replacement = """  return (
    <div className={cn(
      "flex-shrink-0 relative overflow-hidden z-10 transition-colors duration-500",
      isMobile ? "pt-2 pb-2 px-3 bg-background" : "bg-background/60 backdrop-blur-3xl border-b border-border pt-16 pb-8 px-8"
    )}>
      {/* Subtle ambient glass glow */}
      {!isMobile && <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />}
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col gap-3 md:gap-6">
          <div className="hidden md:flex items-center justify-between">
            <h1 className="text-5xl font-semibold tracking-tight text-foreground drop-shadow-sm">
              {title}
            </h1>
            <OnlineSourceSelector kind={kind} variant="secondary" className="h-10 px-4 bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border rounded-md shadow-sm backdrop-blur-md" />
          </div>

          <div className="relative group">
            {isMobile ? (
              // Mobile Premium Search Bar (Precision Noir)
              <div className="flex items-center bg-surface-container-low/50 backdrop-blur-xl border border-border/50 rounded-2xl p-1.5 focus-within:border-primary/50 focus-within:bg-surface-container-low transition-all duration-300 shadow-sm">
                <div className="pl-3 pr-2 text-muted-foreground">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search books...' : 'Search manga...'}
                  className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:ring-0 py-2.5 px-0"
                  disabled={disabled}
                />
                
                <div className="flex items-center gap-1.5 pr-1">
                  <OnlineSourceSelector 
                    kind={kind} 
                    variant="ghost" 
                    className="w-10 h-10 p-0 rounded-xl flex items-center justify-center transition-all hover:bg-secondary/80 text-muted-foreground max-md:[&>span]:hidden" 
                  />
                  {(kind === 'books' || (kind === 'manga' && isMobile)) && (
                    <button 
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        (kind === 'books' && hasFilters) 
                          ? "bg-primary text-primary-foreground shadow-md" 
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 bg-background/50"
                      )}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                  )}
                  {searchValue.trim() && (
                    <button 
                      onClick={onSubmit} 
                      disabled={loading || disabled}
                      className="ml-1 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-md active:scale-95"
                    >
                      Go
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // Desktop Search Bar
              <div className="flex items-end border-b border-border focus-within:border-primary transition-colors duration-300 pb-2">
                <Compass className="w-6 h-6 text-muted-foreground mb-4 mr-4" />
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search your library...' : 'Search manga by title...'}
                  className="w-full bg-transparent border-none outline-none text-2xl font-medium text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-4 px-0"
                  disabled={disabled}
                />
                <div className="flex items-center gap-3 mb-0.5 ml-4">
                  {kind === 'books' && (
                    <button 
                      onClick={() => setAdvancedOpen(true)}
                      className={`p-3 rounded-xl transition-all ${hasFilters ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={onSubmit} 
                    disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                    className="px-6 py-3 text-base rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Search
                  </button>
                </div>
              </div>
            )}
          </div>

          {isMobile && preferences?.preferredContentType === 'both' && (
            <div className="flex px-1 gap-1">
              <button
                onClick={() => setCurrentView('online-books')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold rounded-xl transition-all relative overflow-hidden",
                  kind === 'books'
                    ? "text-foreground bg-secondary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                )}
              >
                <Globe className="w-3.5 h-3.5" /> Books
                {kind === 'books' && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-foreground rounded-t-full shadow-[0_-2px_8px_rgba(255,255,255,0.5)]" />
                )}
              </button>
              <button
                onClick={() => setCurrentView('online-manga')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold rounded-xl transition-all relative overflow-hidden",
                  kind === 'manga'
                    ? "text-foreground bg-secondary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" /> Manga
                {kind === 'manga' && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-foreground rounded-t-full shadow-[0_-2px_8px_rgba(255,255,255,0.5)]" />
                )}
              </button>
            </div>
          )}
        </div>

        {kind === 'books' && (
          <AdvancedOnlineSearchDialog 
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            onSearch={onSubmit}
          />
        )}

        {disabled && disabledMessage && (
          <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive shadow-inner">
            {disabledMessage}
          </div>
        )}
      </div>
    </div>
  );
}"""

# Check if search is imported, if not, add it.
if "Search," not in content and "Search " not in content:
    content = content.replace("Compass, Filter", "Compass, Filter, Search")

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/components/online/OnlineSearchHeader.tsx', 'w') as f:
    f.write(new_content)
