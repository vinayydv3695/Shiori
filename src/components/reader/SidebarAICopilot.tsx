import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useAIStore } from '@/store/aiStore';
import { 
  Brain, 
  Send, 
  Trash2, 
  Settings2, 
  Loader2, 
  User, 
  Copy, 
  Check, 
  Volume2, 
  ChevronRight, 
  BookOpen, 
  Users, 
  Compass, 
  Lightbulb, 
  ShieldCheck, 
  Key,
  AlertCircle
} from 'lucide-react';
import { AISettingsDialog } from './AISettingsDialog';
import { cn } from '@/lib/utils';
import type { ReadingContext } from '@/lib/ai/types';
import { ttsEngine } from '@/lib/ttsEngine';
import { logger } from '@/lib/logger';
import { useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';

interface SidebarAICopilotProps {
  bookId: number;
  bookTitle?: string;
  author?: string;
  chapterTitle?: string;
  chapterIndex?: number;
}

const STARTER_PROMPTS = [
  {
    title: 'Summarize this chapter',
    desc: 'Key plot points and events so far',
    icon: BookOpen,
    prompt: 'Summarize what happened in this chapter with key events.',
  },
  {
    title: 'Characters in this scene',
    desc: 'Motives, relationships, and introductions',
    icon: Users,
    prompt: 'Who are the key characters introduced so far and what are their motives?',
  },
  {
    title: 'Historical & literary context',
    desc: 'Setting details and era background',
    icon: Compass,
    prompt: 'Explain the historical and literary context of this setting.',
  },
  {
    title: 'Core themes & symbols',
    desc: 'Underlying motifs and narrative themes',
    icon: Lightbulb,
    prompt: 'What are the core themes and symbols being explored here?',
  },
];

export function SidebarAICopilot({
  bookId,
  bookTitle,
  author,
  chapterTitle,
  chapterIndex,
}: SidebarAICopilotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readerTheme = useReadingSettings((s) => s.theme);

  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeProvider = useAIStore((s) => s.activeProvider);
  const apiKeys = useAIStore((s) => s.apiKeys);
  const chatHistories = useAIStore((s) => s.chatHistories);
  const isGenerating = useAIStore((s) => s.isGenerating);
  const currentResponse = useAIStore((s) => s.currentResponse);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const clearChat = useAIStore((s) => s.clearChat);
  const lastError = useAIStore((s) => s.lastError);
  const clearError = useAIStore((s) => s.clearError);

  const messages = chatHistories[bookId] || [];
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const isConfigured = activeProvider === 'ollama' || Boolean(apiKeys[activeProvider]?.trim());

  // Dynamically attach active reader theme CSS variables to ensure perfect contrast
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme || 'paper');
    // No cleanup here: re-applies overwrite the vars, and removal happens only
    // on unmount so a theme change can never leave the panel unthemed.
  }, [readerTheme]);

  useLayoutEffect(() => () => {
    const el = containerRef.current;
    if (el) removeReaderThemeFromElement(el);
  }, []);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse, isGenerating]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isGenerating) return;
    setInput('');
    clearError();

    const context: ReadingContext = {
      bookId,
      bookTitle,
      author,
      chapterTitle,
      chapterIndex,
    };

    try {
      await sendMessage(bookId, q, context);
    } catch (err) {
      // Surfaced to the user via the store's lastError bubble below.
      logger.error('[AICopilot] Failed to send message:', err);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReadAloud = (text: string) => {
    if (ttsEngine.isAvailable()) {
      ttsEngine.speak(text, { rate: 1.0 });
    }
  };

  const displayChapter = chapterTitle || (chapterIndex !== undefined ? `Ch. ${chapterIndex + 1}` : 'Current Chapter');

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full select-text transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. Unified Single-Line Header */}
      <div 
        className="px-3 py-2 flex items-center justify-between gap-2 select-none shrink-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--ui-border)',
        }}
      >
        {/* Left: Icon, Title, Provider badge, and current chapter */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div 
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--ui-hover)',
              border: '1px solid var(--ui-border)',
              color: 'var(--text-primary)',
            }}
          >
            <Brain size={13} />
          </div>

          <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
            Book Copilot
          </span>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0"
            style={{
              backgroundColor: 'var(--ui-hover)',
              border: '1px solid var(--ui-border)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Configure AI model & API keys"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isConfigured ? '#22c55e' : '#f59e0b' }} />
            <span className="capitalize">{activeProvider === 'opencode' ? 'OpenCode' : activeProvider}</span>
          </button>

          <span 
            className="text-[11px] truncate hidden xs:inline opacity-80"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label={`${displayChapter} (Spoiler Guard Active)`}
          >
            • {displayChapter}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span 
            className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Spoiler Guard: AI will not reveal plot twists beyond this chapter"
          >
            <ShieldCheck size={11} className="text-primary" />
          </span>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => clearChat(bookId)}
              className="p-1 rounded-md transition-colors cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Clear conversation"
            >
              <Trash2 size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1 rounded-md transition-colors cursor-pointer hover:opacity-80"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="AI Settings & API Keys"
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {/* 2. Messages Container */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Unconfigured API key notice */}
        {!isConfigured && messages.length === 0 && (
          <div 
            className="p-3 rounded-xl flex items-start gap-2.5 text-xs shadow-xs"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--ui-border)',
            }}
          >
            <Key size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>API Key Setup Required</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Add your Gemini, Groq, or OpenAI API key to start chatting with your book.
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold underline cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                Configure in Settings →
              </button>
            </div>
          </div>
        )}

        {/* Empty State / Prompt Cards */}
        {messages.length === 0 && !isGenerating && (
          <div className="py-2 space-y-3">
            <div className="text-center space-y-1 px-2">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto shadow-xs"
                style={{
                  backgroundColor: 'var(--ui-hover)',
                  border: '1px solid var(--ui-border)',
                  color: 'var(--text-primary)',
                }}
              >
                <Brain size={20} />
              </div>
              <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Ask anything about this book
              </h4>
              <p className="text-[11px] max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Context is locked to {displayChapter} with zero future spoilers.
              </p>
            </div>

            {/* Quick Starters */}
            <div className="space-y-1.5 pt-1">
              <span 
                className="text-[10px] font-semibold uppercase tracking-wider px-1 block"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Suggested Questions
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {STARTER_PROMPTS.map((starter) => {
                  const Icon = starter.icon;
                  return (
                    <button
                      key={starter.title}
                      type="button"
                      onClick={() => handleSend(starter.prompt)}
                      className="w-full text-left p-2.5 rounded-xl transition-all duration-150 flex items-center justify-between gap-2.5 group cursor-pointer shadow-xs hover:shadow-sm"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--ui-border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            backgroundColor: 'var(--ui-hover)',
                            border: '1px solid var(--ui-border)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <Icon size={13} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {starter.title}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                            {starter.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} className="group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg) => {
          const isError = msg.content.includes('Gemini Error:') || msg.content.includes('Error:');

          return (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col space-y-1',
                msg.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div className="flex items-center gap-1.5 text-[10px] px-1" style={{ color: 'var(--text-tertiary)' }}>
                {msg.role === 'user' ? (
                  <>
                    <span>You</span>
                    <User size={10} />
                  </>
                ) : (
                  <>
                    <Brain size={11} style={{ color: 'var(--text-primary)' }} />
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Shiori AI</span>
                  </>
                )}
              </div>

              <div
                className={cn(
                  'rounded-2xl px-3 py-2 text-xs max-w-[92%] leading-relaxed whitespace-pre-wrap relative group transition-all shadow-xs',
                  msg.role === 'user'
                    ? 'rounded-tr-xs'
                    : 'rounded-tl-xs'
                )}
                style={{
                  backgroundColor: msg.role === 'user' ? 'var(--ui-hover)' : 'var(--bg-secondary)',
                  border: isError ? '1px solid #ef4444' : '1px solid var(--ui-border)',
                  color: 'var(--text-primary)',
                }}
              >
                {msg.content}

                {/* Helpful recovery button if this was an API error */}
                {isError && (
                  <div className="mt-2 pt-1.5 border-t border-red-500/30 flex items-center justify-between">
                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> AI request failed
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="text-[10px] font-semibold underline cursor-pointer"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Change Model or Key →
                    </button>
                  </div>
                )}

                {msg.role === 'assistant' && !isError && (
                  <div 
                    className="mt-2 pt-1.5 flex items-center justify-end gap-1 border-t"
                    style={{ borderColor: 'var(--ui-border)' }}
                  >
                    <button
                      type="button"
                      onClick={() => handleReadAloud(msg.content)}
                      className="px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--ui-border)',
                        color: 'var(--text-secondary)',
                      }}
                      aria-label="Read Aloud with Voice"
                    >
                      <Volume2 size={11} />
                      <span>Speak</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--ui-border)',
                        color: 'var(--text-secondary)',
                      }}
                      aria-label="Copy"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check size={11} className="text-green-500" />
                          <span className="text-green-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Store-level error bubble */}
        {lastError && (
          <div className="flex flex-col space-y-1 items-start">
            <div className="flex items-center gap-1.5 text-[10px] px-1" style={{ color: 'var(--text-tertiary)' }}>
              <AlertCircle size={11} style={{ color: '#ef4444' }} />
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Shiori AI</span>
            </div>
            <div
              className="rounded-2xl px-3 py-2 text-xs max-w-[92%] leading-relaxed whitespace-pre-wrap rounded-tl-xs shadow-xs"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid #ef4444',
                color: 'var(--text-primary)',
              }}
            >
              {lastError}
              <div className="mt-2 pt-1.5 border-t border-red-500/30 flex items-center justify-between gap-2">
                <span className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertCircle size={11} /> AI request failed
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="text-[10px] font-semibold underline cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Change Model or Key →
                  </button>
                  <button
                    type="button"
                    onClick={clearError}
                    className="text-[10px] font-semibold underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                    aria-label="Dismiss error"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Streaming In-Progress Message */}
        {isGenerating && (
          <div className="flex flex-col space-y-1 items-start">
            <div className="flex items-center gap-1.5 text-[10px] px-1" style={{ color: 'var(--text-tertiary)' }}>
              <Brain size={11} style={{ color: 'var(--text-primary)' }} />
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Shiori AI</span>
            </div>
            <div 
              className="rounded-2xl px-3 py-2 text-xs max-w-[92%] leading-relaxed rounded-tl-xs shadow-xs"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--ui-border)',
                color: 'var(--text-primary)',
              }}
            >
              {currentResponse ? (
                <span className="whitespace-pre-wrap">{currentResponse}</span>
              ) : (
                <div className="flex items-center gap-2 py-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  <Loader2 size={12} className="animate-spin text-primary" />
                  <span className="text-[11px]">Thinking...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* 3. Input Box */}
      <div 
        className="p-2.5 select-none shrink-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--ui-border)',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all shadow-xs"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--ui-border)',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this book or chapter..."
            className="flex-1 text-xs bg-transparent border-none outline-none py-0.5"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="p-1.5 rounded-lg transition-all cursor-pointer shrink-0 disabled:opacity-30"
            style={{
              backgroundColor: 'var(--text-primary)',
              color: 'var(--bg-primary)',
            }}
            aria-label="Send"
          >
            <Send size={12} />
          </button>
        </form>
        <div 
          className="flex items-center justify-between text-[10px] px-1 mt-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>🛡️ Spoiler-free • {displayChapter}</span>
          <span>Enter to send</span>
        </div>
      </div>

      <AISettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
