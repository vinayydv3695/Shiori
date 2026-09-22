import React, { useState, useEffect, useRef } from 'react';
import { useAIStore } from '@/store/aiStore';
import { executeAICompletion, explainSelection, summarizeSelection, explainCharacter } from '@/lib/ai/aiClient';
import type { ReadingContext } from '@/lib/ai/types';
import { 
  Brain, 
  X, 
  Send, 
  Copy, 
  Check, 
  Settings2, 
  Loader2, 
  BookmarkPlus, 
  BookOpen,
  User,
  ListCollapse,
  ArrowLeft,
  Volume2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ttsEngine } from '@/lib/ttsEngine';
import { AISettingsDialog } from './AISettingsDialog';

interface AICopilotPopupProps {
  selectedText: string;
  context?: ReadingContext;
  onClose: () => void;
  onSaveAsNote?: (noteContent: string) => void;
}

export function AICopilotPopup({
  selectedText,
  context,
  onClose,
  onSaveAsNote,
}: AICopilotPopupProps) {
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<'explain' | 'summarize' | 'character' | 'custom'>('explain');

  const getActiveConfig = useAIStore((s) => s.getActiveConfig);
  const activeProvider = useAIStore((s) => s.activeProvider);

  // Monotonic sequence guard: every request start bumps it and aborts the
  // previous controller, so stale completions can never write state.
  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight request when the popup unmounts.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runAction = async (action: 'explain' | 'summarize' | 'character', customQuery?: string) => {
    setActiveAction(action);
    setLoading(true);
    setError(null);
    setResponse('');

    // Invalidate previous requests and take ownership of the newest one.
    const seq = ++requestSeqRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;
    const isStale = () => seq !== requestSeqRef.current;

    const config = getActiveConfig();

    try {
      if (action === 'explain') {
        await explainSelection(config, selectedText, context, {
          signal,
          onChunk: (_, full) => {
            if (!isStale()) setResponse(full);
          },
        });
      } else if (action === 'summarize') {
        await summarizeSelection(config, selectedText, context, {
          signal,
          onChunk: (_, full) => {
            if (!isStale()) setResponse(full);
          },
        });
      } else if (action === 'character') {
        await explainCharacter(config, selectedText.trim(), context, {
          signal,
          onChunk: (_, full) => {
            if (!isStale()) setResponse(full);
          },
        });
      } else if (customQuery) {
        await executeAICompletion(
          config,
          [
            {
              role: 'user',
              content: `Regarding this passage:\n"${selectedText}"\n\nQuestion: ${customQuery}`,
            },
          ],
          {
            context,
            signal,
            onChunk: (_, full) => {
              if (!isStale()) setResponse(full);
            },
          }
        );
      }
    } catch (err) {
      if (isStale() || (err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to complete AI request');
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  useEffect(() => {
    // Run default explanation on selection. Deferred one tick so setState
    // happens outside the effect body; the seq guard inside runAction still
    // invalidates any in-flight request.
    const t = setTimeout(() => {
      void runAction('explain');
    }, 0);
    return () => clearTimeout(t);
  }, [selectedText]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim() || loading) return;
    setActiveAction('custom');
    setLoading(true);
    setError(null);
    setResponse('');

    // Invalidate previous requests and take ownership of the newest one.
    const seq = ++requestSeqRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const config = getActiveConfig();
    void executeAICompletion(
      config,
      [
        {
          role: 'user',
          content: `Regarding this passage:\n"${selectedText}"\n\nQuestion: ${customQuestion}`,
        },
      ],
      {
        context,
        signal,
        onChunk: (_, full) => {
          if (seq !== requestSeqRef.current) return;
          setResponse(full);
        },
      }
    )
      .catch((err) => {
        if (seq !== requestSeqRef.current || err?.name === 'AbortError') return;
        setError(err?.message || 'Error occurred');
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setLoading(false);
      });
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReadAloud = () => {
    if (!response || !ttsEngine.isAvailable()) return;
    ttsEngine.speak(response, { rate: 1.0 });
  };

  return (
    <>
      <div 
        className="ai-copilot-popup select-text"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ai-copilot-popup-header">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="Back to toolbar"
            >
              <ArrowLeft size={14} />
            </button>
            <Brain size={15} className="text-primary" />
            <span className="font-semibold text-xs text-foreground">Ask AI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono capitalize">
              {activeProvider === 'opencode' ? 'OpenCode' : activeProvider}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="AI Settings & API Keys"
            >
              <Settings2 size={13} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Action Pills */}
        <div className="ai-copilot-popup-tabs">
          <button
            type="button"
            onClick={() => runAction('explain')}
            className={cn(
              'ai-copilot-popup-tab',
              activeAction === 'explain' && 'ai-copilot-popup-tab--active'
            )}
          >
            <BookOpen size={11} /> Explain
          </button>
          <button
            type="button"
            onClick={() => runAction('summarize')}
            className={cn(
              'ai-copilot-popup-tab',
              activeAction === 'summarize' && 'ai-copilot-popup-tab--active'
            )}
          >
            <ListCollapse size={11} /> Summarize
          </button>
          <button
            type="button"
            onClick={() => runAction('character')}
            className={cn(
              'ai-copilot-popup-tab',
              activeAction === 'character' && 'ai-copilot-popup-tab--active'
            )}
          >
            <User size={11} /> Character
          </button>
        </div>

        {/* Body Result */}
        <div className="ai-copilot-popup-body space-y-2">
          {loading && !response && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-xs">
              <Loader2 size={15} className="animate-spin text-primary" />
              <span>Analyzing passage...</span>
            </div>
          )}

          {error && (
            <div 
              className="p-3 rounded-xl text-xs space-y-1.5 shadow-xs"
              style={{
                backgroundColor: 'var(--ui-hover)',
                border: '1px solid #ef444460',
                color: 'var(--text-primary)',
              }}
            >
              <div className="font-semibold text-[11px] text-red-400 flex items-center gap-1">
                <span>Notice</span>
              </div>
              <p className="leading-relaxed text-[11px]" style={{ color: 'var(--text-secondary)' }}>{error}</p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="text-[11px] underline font-semibold block cursor-pointer hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
              >
                Configure API Key & Model →
              </button>
            </div>
          )}

          {response && (
            <div className="whitespace-pre-wrap leading-relaxed text-xs text-foreground font-sans">
              {response}
            </div>
          )}
        </div>

        {/* Footer Actions when response is ready */}
        {response && !loading && (
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground">Anti-spoiler active</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleReadAloud}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Read Aloud with Voice"
              >
                <Volume2 size={13} />
              </button>
              {onSaveAsNote && (
                <button
                  type="button"
                  onClick={() => onSaveAsNote(response)}
                  className="px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-[11px] font-medium text-foreground flex items-center gap-1 transition-colors"
                  aria-label="Save AI explanation to book notes"
                >
                  <BookmarkPlus size={12} /> Note
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy response"
              >
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* Custom Input Row */}
        <form onSubmit={handleCustomSubmit} className="ai-copilot-popup-input-row">
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Ask AI about this selection..."
            className="ai-copilot-popup-input"
          />
          <button
            type="submit"
            disabled={loading || !customQuestion.trim()}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Send Question"
          >
            <Send size={13} />
          </button>
        </form>
      </div>

      <AISettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
