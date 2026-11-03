import React, { useState, useEffect } from 'react';
import { useDictionaryStore } from '@/store/dictionaryStore';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { isTauri, type DictionaryResponse } from '@/lib/tauri';
import {
  BookA,
  BookOpen,
  Languages,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  HardDrive,
  FileArchive,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AppTooltip } from '@/components/ui/tooltip';
import { SettingSection, SettingItem } from './SettingsDialog';

export function DictionarySettingsSection() {
  const dictionaries = useDictionaryStore((s) => s.dictionaries);
  const loading = useDictionaryStore((s) => s.loading);
  const loadDictionaries = useDictionaryStore((s) => s.loadDictionaries);
  const toggleDictionary = useDictionaryStore((s) => s.toggleDictionary);
  const deleteDictionary = useDictionaryStore((s) => s.deleteDictionary);
  const importDictionary = useDictionaryStore((s) => s.importDictionary);
  const testLookup = useDictionaryStore((s) => s.testLookup);

  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<DictionaryResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [testSearched, setTestSearched] = useState(false);

  useEffect(() => {
    void loadDictionaries();
  }, [loadDictionaries]);

  const handleImport = async () => {
    if (!isTauri) return;
    try {
      const selected = await openDialog({
        title: 'Select Dictionary File',
        multiple: false,
        filters: [
          {
            name: 'Dictionary Archives & Files',
            extensions: ['zip', 'json', 'idx', 'dict', 'ifo'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        await importDictionary(selected);
      }
    } catch (err) {
      console.error('Failed to open file picker for dictionary:', err);
    }
  };

  const handleTestLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = testQuery.trim();
    if (!query) return;

    setTesting(true);
    setTestSearched(true);
    try {
      const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(query);
      const res = await testLookup(query, isJapanese ? 'ja' : 'en');
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Active Dictionaries Section ── */}
      <SettingSection
        title="Offline Dictionaries"
        description="Lookup definitions, phonetics, and Japanese readings locally without internet access or API limits."
      >
        <div className="space-y-3 pt-1">
          {dictionaries.length === 0 && !loading && (
            <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 text-center text-sm text-muted-foreground">
              No dictionaries found. Loading default lexicons...
            </div>
          )}

          {dictionaries.map((dict) => {
            const isBuiltin = dict.format === 'builtin';
            const isJapanese = dict.lang_src === 'ja';

            return (
              <div
                key={dict.id}
                className={cn(
                  'flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-200',
                  dict.is_enabled
                    ? 'bg-secondary/40 border-border/70 hover:bg-secondary/60'
                    : 'bg-muted/15 border-border/40 opacity-60'
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs',
                      isJapanese
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                    )}
                  >
                    {isJapanese ? (
                      <Languages className="w-5 h-5 stroke-[2]" />
                    ) : (
                      <BookA className="w-5 h-5 stroke-[2]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground truncate">
                        {dict.name}
                      </span>

                      {/* Format Badge */}
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground">
                        {dict.format}
                      </span>

                      {/* Lang pair */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {dict.lang_src.toUpperCase()} → {dict.lang_target.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium">
                        <HardDrive className="w-3 h-3 opacity-70" />
                        {dict.entry_count.toLocaleString()} entries
                      </span>

                      {isBuiltin && (
                        <span className="flex items-center gap-1 text-emerald-500 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          Pre-installed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isBuiltin && (
                    <AppTooltip content="Delete dictionary">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        onClick={() => void deleteDictionary(dict.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AppTooltip>
                  )}

                  <Switch
                    checked={dict.is_enabled}
                    onChange={(checked) => void toggleDictionary(dict.id, checked)}
                    aria-label={`Toggle ${dict.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Import Button & Details ── */}
        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Import Custom Dictionaries</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                Compatible with <strong>Yomichan (.zip)</strong>, <strong>StarDict (.idx/.dict or .zip)</strong>, and JSON dictionaries.
              </p>
            </div>

            <Button
              onClick={() => void handleImport()}
              disabled={loading}
              className="gap-2 rounded-xl h-10 px-4 text-xs font-bold cursor-pointer shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Import Dictionary (.zip / .idx / .json)
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* ── Interactive Lookup Tester ── */}
      <SettingSection
        title="Dictionary Lookup Tester"
        description="Verify how offline entries resolve definitions, phonetics, and Japanese readings."
      >
        <form onSubmit={handleTestLookup} className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Try 'serendipity', 'novel', '魔法', or '猫'..."
                className="pl-9 h-10 rounded-xl bg-secondary/40 border-border/60 text-sm"
              />
            </div>
            <Button
              type="submit"
              disabled={!testQuery.trim() || testing}
              className="rounded-xl h-10 px-5 text-xs font-bold cursor-pointer shrink-0"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
            </Button>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="text-[11px] font-semibold mr-1">Quick examples:</span>
            {['serendipity', 'ephemeral', 'adventure', '読書', '魔法', '猫'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setTestQuery(preset);
                  const isJa = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(preset);
                  setTesting(true);
                  setTestSearched(true);
                  testLookup(preset, isJa ? 'ja' : 'en')
                    .then((res) => setTestResult(res))
                    .finally(() => setTesting(false));
                }}
                className="px-2.5 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-foreground text-[11px] font-medium border border-border/40 transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Result Card */}
          {testSearched && (
            <div className="mt-3 p-4 rounded-2xl bg-secondary/35 border border-border/70 space-y-3">
              {testResult ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="text-lg font-bold text-foreground tracking-tight">
                          {testResult.word}
                        </h4>
                        {testResult.reading && (
                          <span className="text-sm font-semibold text-primary">
                            {testResult.reading}
                          </span>
                        )}
                        {testResult.phonetic && !testResult.reading && (
                          <span className="text-xs font-mono text-muted-foreground">
                            /{testResult.phonetic.replace(/^\/+|\/+$/g, '')}/
                          </span>
                        )}
                        {testResult.jlpt_level && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20">
                            JLPT N{testResult.jlpt_level}
                          </span>
                        )}
                      </div>

                      {testResult.source_url && (
                        <span className="text-[11px] font-medium text-emerald-500 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          {testResult.source_url}
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                      {testResult.is_offline ? 'Offline Ready' : 'Online API'}
                    </span>
                  </div>

                  {/* Meanings */}
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    {testResult.meanings.map((meaning, idx) => (
                      <div key={idx} className="space-y-1">
                        <span className="inline-block text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {meaning.part_of_speech}
                        </span>
                        <ul className="list-disc list-inside space-y-1 text-xs text-foreground/90 pl-1">
                          {meaning.definitions.map((def, dIdx) => (
                            <li key={dIdx} className="leading-relaxed">
                              <span>{def.definition}</span>
                              {def.example && (
                                <p className="text-[11px] italic text-muted-foreground mt-0.5 pl-4">
                                  &ldquo;{def.example}&rdquo;
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No definition found for &ldquo;{testQuery}&rdquo; in current dictionaries.
                </div>
              )}
            </div>
          )}
        </form>
      </SettingSection>
    </div>
  );
}
