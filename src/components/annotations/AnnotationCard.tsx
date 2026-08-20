import React from 'react';
import { AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { Bookmark, BookmarkPlus, Highlighter, StickyNote, Share2, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export const getAnnotationIcon = (type: string) => {
  switch (type) {
    case 'highlight':
      return <Highlighter className="w-4.5 h-4.5 text-primary" />;
    case 'note':
      return <StickyNote className="w-4.5 h-4.5 text-primary" />;
    case 'bookmark':
      return <Bookmark className="w-4.5 h-4.5 text-primary" />;
    case 'vocabulary':
      return <BookmarkPlus className="w-4.5 h-4.5 text-primary" />;
    default:
      return <Highlighter className="w-4.5 h-4.5 text-primary" />;
  }
};

interface AnnotationCardProps {
  result: AnnotationSearchResult;
  categories: AnnotationCategory[];
  onOpenBook?: (bookId: number, location?: string, annotationId?: number) => void;
  setQuoteCardData: (data: AnnotationSearchResult) => void;
}

export function AnnotationCard({ result, categories, onOpenBook, setQuoteCardData }: AnnotationCardProps) {
  let isVocabulary = false;
  let vocabData: any = null;
  if (result.annotation.noteContent) {
    try {
      vocabData = JSON.parse(result.annotation.noteContent);
      if (vocabData && (vocabData.type === 'define' || vocabData.type === 'translate')) {
        isVocabulary = true;
      }
    } catch {
      // Not JSON, just a regular note
    }
  }

  return (
    <div 
      className="break-inside-avoid mb-4 md:mb-6 relative z-0 isolation-isolate group transition-all duration-300 hover:-translate-y-0.5"
    >
      {/* Theme Matched Card Background */}
      <div className="absolute inset-0 bg-card/80 backdrop-blur-xl border border-border/50 hover:border-primary/40 rounded-[1.25rem] shadow-sm transition-all duration-300 z-0" />
      
      <div className="p-4 flex flex-col h-full relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3.5">
          <div className="flex items-center gap-3">
            <div className="shrink-0 p-1.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-300">
              {isVocabulary ? (
                <BookmarkPlus className="w-4.5 h-4.5 text-primary" />
              ) : (
                getAnnotationIcon(result.annotation.annotationType)
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground/80">
              <span className="font-extrabold tracking-[0.1em] uppercase text-[10px]">{formatDate(result.annotation.createdAt || '')}</span>
              {result.annotation.chapterTitle && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="truncate max-w-[120px] sm:max-w-[200px] font-medium font-serif italic text-[12px] md:text-[13px] text-foreground/90" title={result.annotation.chapterTitle}>
                    {result.annotation.chapterTitle}
                  </span>
                </>
              )}
            </div>
          </div>
          
          {/* Quick Actions (Always visible on mobile/touch, hover on desktop) */}
          <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300 flex items-center gap-1 -mt-1 -mr-1 shrink-0">
            {result.annotation.selectedText && (
              <button 
                onClick={() => setQuoteCardData(result)}
                className="w-8 h-8 flex items-center justify-center bg-muted/40 md:bg-transparent hover:bg-primary/10 rounded-xl text-muted-foreground hover:text-primary transition-all duration-200 active:scale-95 cursor-pointer"
                title="Create Quote Card"
              >
                <Share2 size={14} />
              </button>
            )}
            {onOpenBook && (
              <button 
                onClick={() => onOpenBook(result.annotation.bookId, result.annotation.location, result.annotation.id)}
                className="w-8 h-8 flex items-center justify-center bg-muted/40 md:bg-transparent hover:bg-primary/10 rounded-xl text-muted-foreground hover:text-primary transition-all duration-200 active:scale-95 cursor-pointer"
                title="Jump to location"
              >
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Vocabulary Badge */}
        {isVocabulary && (
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg font-extrabold bg-primary/15 text-primary border border-primary/25 shadow-2xs">
              Vocabulary
            </span>
          </div>
        )}

        {/* Category Tag */}
        {!isVocabulary && result.annotation.categoryId && categories.find(c => c.id === result.annotation.categoryId) && (
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg font-extrabold bg-primary/15 text-primary border border-primary/25 shadow-2xs">
              {categories.find(c => c.id === result.annotation.categoryId)?.name}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-3.5">
          {result.annotation.selectedText && (
            <div className="relative pl-3.5 py-1 group/quote">
              {/* Theme Primary vertical accent line */}
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-primary/80 transition-all duration-300" />
              
              <span className="text-foreground/90 text-[14px] md:text-[15px] leading-relaxed font-serif font-medium tracking-tight relative z-10 block">
                {result.annotation.selectedText}
              </span>
            </div>
          )}

          {result.annotation.noteContent && !isVocabulary && (
            <div className="pt-3 mt-2 border-t border-border/40 relative z-10">
              <div className="text-[14px] prose prose-sm dark:prose-invert max-w-none text-muted-foreground font-serif italic">
                <ReactMarkdown>{result.annotation.noteContent}</ReactMarkdown>
              </div>
            </div>
          )}
          
          {isVocabulary && vocabData && (
            <div className="mt-3 pl-1 relative z-10">
              <div className="text-sm flex flex-col gap-4">
                {vocabData.type === 'define' && vocabData.data?.meanings?.length && (
                  <div className="space-y-4">
                    {vocabData.data.phonetic && (
                      <div className="flex items-center gap-2.5 text-muted-foreground/70 border-b border-border/30 pb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                        <span className="text-[14px] font-medium tracking-widest font-serif italic">{vocabData.data.phonetic}</span>
                      </div>
                    )}
                    <div className="space-y-4">
                      {vocabData.data.meanings.slice(0, 2).map((m: any, i: number) => (
                        <div key={i} className="flex flex-col gap-1.5 relative pl-4">
                          <div className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="font-extrabold text-[10px] text-primary uppercase tracking-[0.2em]">{m.part_of_speech}</span>
                          <div className="text-foreground/90 text-[14px] leading-relaxed font-medium">{m.definitions[0]?.definition}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {vocabData.type === 'translate' && vocabData.data?.translated_text && (
                  <div className="space-y-2 mt-2 pt-3 border-t border-border/30">
                    <div className="text-foreground text-[17px] font-serif font-semibold tracking-tight">{vocabData.data.translated_text}</div>
                    <div className="text-[9px] text-muted-foreground/70 uppercase tracking-[0.2em] font-extrabold">Translated via {vocabData.data.provider}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
