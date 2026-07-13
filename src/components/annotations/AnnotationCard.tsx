import React from 'react';
import { AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { Bookmark, BookmarkPlus, Highlighter, StickyNote, Share2, ExternalLink, Quote } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export const getAnnotationIcon = (type: string) => {
  switch (type) {
    case 'highlight':
      return <Highlighter className="w-5 h-5 text-yellow-500" />;
    case 'note':
      return <StickyNote className="w-5 h-5 text-blue-500" />;
    case 'bookmark':
      return <Bookmark className="w-5 h-5 text-blue-500" />;
    case 'vocabulary':
      return <BookmarkPlus className="w-5 h-5 text-purple-500" />;
    default:
      return <Highlighter className="w-5 h-5 text-muted-foreground" />;
  }
};

interface AnnotationCardProps {
  result: AnnotationSearchResult;
  categories: AnnotationCategory[];
  onOpenBook?: (bookId: number, location?: string) => void;
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

  const tintColor = result.annotation.color || '#3b82f6';

  return (
    <div 
      className="break-inside-avoid mb-8 relative z-0 isolation-isolate group transition-all duration-500 hover:-translate-y-1"
    >
      {/* Premium Minimalist Card Background */}
      <div className="absolute inset-0 bg-muted/20 hover:bg-muted/40 border border-transparent group-hover:border-border/50 rounded-[1.25rem] transition-all duration-500 z-0 backdrop-blur-sm" />
      
      {/* Subtle Accent Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-700 pointer-events-none rounded-[1.5rem] z-0" style={{ backgroundImage: `radial-gradient(circle at top right, ${tintColor}, transparent 70%)` }} />

      <div className="p-4 md:p-6 flex flex-col h-full relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 md:mb-5">
          <div className="flex items-center gap-3.5">
            <div className="shrink-0 text-muted-foreground/40 group-hover:text-primary/80 transition-colors duration-500">
              {isVocabulary ? (
                <BookmarkPlus className="w-5 h-5" />
              ) : (
                getAnnotationIcon(result.annotation.annotationType)
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground/60">
              <span className="font-bold tracking-[0.1em] uppercase text-[10px]">{formatDate(result.annotation.createdAt || '')}</span>
              {result.annotation.chapterTitle && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="truncate max-w-[120px] sm:max-w-[200px] font-medium font-serif italic text-[12px] md:text-[13px]" title={result.annotation.chapterTitle}>
                    {result.annotation.chapterTitle}
                  </span>
                </>
              )}
            </div>
          </div>
          
          {/* Quick Actions (Hover) */}
          <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center gap-1.5 -mt-1.5 -mr-1.5 translate-x-2 group-hover:translate-x-0">
            {result.annotation.selectedText && (
              <button 
                onClick={() => setQuoteCardData(result)}
                className="p-2 hover:bg-primary/10 rounded-full text-muted-foreground hover:text-primary transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                title="Create Quote Card"
              >
                <Share2 size={14} />
              </button>
            )}
            {onOpenBook && (
              <button 
                onClick={() => onOpenBook(result.annotation.bookId, result.annotation.location)}
                className="p-2 hover:bg-primary/10 rounded-full text-muted-foreground hover:text-primary transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                title="Jump to location"
              >
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category Tag */}
        {result.annotation.categoryId && categories.find(c => c.id === result.annotation.categoryId) && (
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-md font-bold shadow-sm backdrop-blur-md border" style={{ 
              backgroundColor: `${categories.find(c => c.id === result.annotation.categoryId)?.color}15`, 
              color: categories.find(c => c.id === result.annotation.categoryId)?.color,
              borderColor: `${categories.find(c => c.id === result.annotation.categoryId)?.color}30`
            }}>
              {categories.find(c => c.id === result.annotation.categoryId)?.name}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-6">
          {result.annotation.selectedText && (
            <div className="relative pl-7 py-1 group/quote">
              {/* Decorative background quote mark */}
              <Quote className="absolute left-0 top-0 w-5 h-5 text-muted-foreground/30 -rotate-12 transition-transform duration-700 group-hover:-rotate-0" />
              
              {/* Glowing vertical accent line */}
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full transition-all duration-500 group-hover/quote:w-[4px]" style={{ 
                background: `linear-gradient(to bottom, ${tintColor}, ${tintColor}10)`,
                boxShadow: `0 0 12px ${tintColor}30`
              }} />
              
              <span className="text-foreground/95 text-[16px] md:text-[18px] leading-[1.6] font-serif font-medium tracking-tight relative z-10 block">
                {result.annotation.selectedText}
              </span>
            </div>
          )}

          {result.annotation.noteContent && !isVocabulary && (
            <div className="pt-4 mt-2 border-t border-border/40 relative z-10">
              <div className="text-[14px] prose prose-sm dark:prose-invert max-w-none text-muted-foreground/90 font-serif italic">
                <ReactMarkdown>{result.annotation.noteContent}</ReactMarkdown>
              </div>
            </div>
          )}
          
          {isVocabulary && vocabData && (
            <div className="mt-4 pl-1 relative z-10">
              <div className="text-sm flex flex-col gap-5">
                {vocabData.type === 'define' && vocabData.data?.meanings?.length && (
                  <div className="space-y-6">
                    {vocabData.data.phonetic && (
                      <div className="flex items-center gap-2.5 text-muted-foreground/50 border-b border-border/30 pb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/50"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                        <span className="text-[15px] font-medium tracking-widest font-serif italic">{vocabData.data.phonetic}</span>
                      </div>
                    )}
                    <div className="space-y-5">
                      {vocabData.data.meanings.slice(0, 2).map((m: any, i: number) => (
                        <div key={i} className="flex flex-col gap-2 relative pl-4">
                          <div className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-primary/40" />
                          <span className="font-bold text-[9px] text-primary/80 uppercase tracking-[0.25em]">{m.part_of_speech}</span>
                          <div className="text-foreground/80 text-[15px] leading-relaxed font-medium">{m.definitions[0]?.definition}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {vocabData.type === 'translate' && vocabData.data?.translated_text && (
                  <div className="space-y-2 mt-3 pt-4 border-t border-border/20">
                    <div className="text-foreground/95 text-[18px] font-serif font-semibold tracking-tight">{vocabData.data.translated_text}</div>
                    <div className="text-[9px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">Translated via {vocabData.data.provider}</div>
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
