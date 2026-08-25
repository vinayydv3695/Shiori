import React, { useState } from 'react';
import { AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { Volume2, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AndroidAnnotationCardProps {
  result: AnnotationSearchResult;
  categories: AnnotationCategory[];
  onOpenBook?: (bookId: number, location?: string, annotationId?: number) => void;
  setQuoteCardData: (data: AnnotationSearchResult) => void;
}

export function AndroidAnnotationCard({
  result,
  categories,
  onOpenBook,
  setQuoteCardData,
}: AndroidAnnotationCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  let isVocabulary = false;
  let vocabData: any = null;

  if (result.annotation.noteContent) {
    try {
      vocabData = JSON.parse(result.annotation.noteContent);
      if (vocabData && (vocabData.type === 'define' || vocabData.type === 'translate')) {
        isVocabulary = true;
      }
    } catch {
      // Regular note text
    }
  }

  const categoryObj =
    !isVocabulary && result.annotation.categoryId
      ? categories.find((c) => c.id === result.annotation.categoryId)
      : null;

  const speakFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlaying(false);
    }
  };

  const playAudio = (text: string, audioUrl?: string | null) => {
    setIsPlaying(true);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => speakFallback(text);
      audio.play().catch(() => speakFallback(text));
    } else {
      speakFallback(text);
    }
  };

  const isDefine = isVocabulary && vocabData?.type === 'define';
  const isTranslate = isVocabulary && vocabData?.type === 'translate';

  const rawSelected = (result.annotation.selectedText || '').trim();
  const rawTranslated = isTranslate && vocabData?.data?.translated_text ? vocabData.data.translated_text.trim() : '';
  const isDuplicateTranslation = isTranslate && (!rawTranslated || rawTranslated.toLowerCase() === rawSelected.toLowerCase());

  const wordToSpeak = isDefine ? (vocabData?.data?.word || rawSelected) : rawSelected;

  return (
    <div className="bg-card border border-border/60 hover:border-primary/40 rounded-2xl p-3.5 space-y-2 text-foreground shadow-md shadow-black/5 dark:shadow-black/30 hover:shadow-lg transition-all duration-200 relative group">
      
      {/* ── CASE 1: Vocabulary / Dictionary Definition ── */}
      {isDefine && vocabData?.data ? (
        <div className="space-y-1.5">
          {/* Word Header + Phonetic + Audio Icon */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <h4 className="text-[16px] font-serif font-bold text-foreground tracking-tight truncate">
                {vocabData.data.word || rawSelected}
              </h4>
              {vocabData.data.phonetic && (
                <span className="text-xs font-serif italic text-muted-foreground/70">
                  {vocabData.data.phonetic}
                </span>
              )}
            </div>

            {/* Tap-to-Speak Button */}
            <button
              type="button"
              onClick={() => playAudio(wordToSpeak, vocabData?.data?.audio_url)}
              className={`p-1.5 rounded-full transition-all active:scale-90 cursor-pointer shrink-0 ${
                isPlaying
                  ? 'bg-primary/20 text-primary animate-pulse'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
              }`}
              title="Speak pronunciation"
            >
              <Volume2 size={15} />
            </button>
          </div>

          {/* Definitions */}
          {vocabData.data.meanings?.length > 0 && (
            <div className="space-y-1 pt-0.5">
              {vocabData.data.meanings.slice(0, 2).map((m: any, idx: number) => {
                const firstDef = m.definitions?.[0];
                return (
                  <div key={idx} className="space-y-0.5">
                    <span className="text-[10px] font-extrabold text-primary/90 uppercase tracking-wider">
                      • {m.part_of_speech}
                    </span>
                    {firstDef?.definition && (
                      <p className="text-[12.5px] text-foreground/85 font-sans leading-snug">
                        {firstDef.definition}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : isTranslate ? (
        /* ── CASE 2: Translation Item ── */
        <div className="space-y-1.5">
          {rawSelected && (
            <div className="pl-2 border-l-2 border-primary/60">
              <span className="text-[13px] font-serif italic text-foreground/90 leading-snug block">
                {rawSelected}
              </span>
            </div>
          )}

          {!isDuplicateTranslation && rawTranslated && (
            <div className="text-[13px] font-sans font-medium text-foreground leading-snug pt-0.5">
              {rawTranslated}
            </div>
          )}
          <span className="text-[9px] text-muted-foreground/50 uppercase font-extrabold tracking-wider block">
            Via {vocabData?.data?.provider || 'Google'}
          </span>
        </div>
      ) : (
        /* ── CASE 3: Normal Highlight / Note / Bookmark ── */
        <div className="space-y-1.5">
          {rawSelected && (
            <div className="pl-2 border-l-2 border-primary/70">
              <span className="text-[13px] font-serif font-medium text-foreground/90 leading-snug block line-clamp-4">
                {rawSelected}
              </span>
            </div>
          )}

          {!isVocabulary && result.annotation.noteContent && (
            <div className="text-[12px] font-sans text-muted-foreground leading-relaxed pt-0.5 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{result.annotation.noteContent}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* ── Ultra-Subtle Minimalist Card Footer ── */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 pt-1 border-t border-border/15 mt-1">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span>{formatDate(result.annotation.createdAt || '')}</span>
          {categoryObj && (
            <>
              <span>•</span>
              <span className="text-primary/80 font-semibold truncate">{categoryObj.name}</span>
            </>
          )}
          {result.annotation.chapterTitle && (
            <>
              <span>•</span>
              <span className="italic truncate max-w-[120px]">{result.annotation.chapterTitle}</span>
            </>
          )}
        </div>

        {/* Quick Action: Jump to location */}
        {onOpenBook && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onOpenBook(result.annotation.bookId, result.annotation.location, result.annotation.id)}
                  className="p-1 text-muted-foreground/50 hover:text-primary rounded-md transition-colors cursor-pointer shrink-0"
                  aria-label="Go to location"
                >
                  <ExternalLink size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={4}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-popover/95 border border-border/40 shadow-md text-foreground backdrop-blur-md"
              >
                Go to location
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
