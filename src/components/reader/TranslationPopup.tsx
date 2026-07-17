import type { DictionaryResponse, TranslationResponse } from '@/lib/tauri';
import { BookmarkPlus } from '@/components/icons';

interface TranslationPopupProps {
  loading: boolean;
  dictionaryResult: DictionaryResponse | null;
  error: string | null;
  onClose: () => void;
  onAddVocabulary?: () => void;
}

export function TranslationPopup({
  loading,
  dictionaryResult,
  error,
  onClose,
  onAddVocabulary
}: TranslationPopupProps) {
  return (
    <div className="translation-popup" onMouseDown={(e) => e.stopPropagation()}>
      <div className="translation-popup-header">
        <div className="translation-popup-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', padding: '6px 4px' }}>
          Dictionary
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onAddVocabulary && !loading && !error && dictionaryResult && (
            <button
              className="text-selection-toolbar-btn"
              onClick={onAddVocabulary}
              title="Add to Vocabulary"
              style={{ padding: '4px', width: 'auto', background: 'transparent' }}
            >
              <BookmarkPlus size={14} />
            </button>
          )}
          <button
            className="text-selection-toolbar-btn translation-popup-close-btn"
            onClick={onClose}
            title="Close"
            style={{ padding: '4px', width: 'auto', background: 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div className="translation-popup-body">
        {loading && (
          <div className="translation-popup-loading">
            <svg className="translation-popup-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
          </div>
        )}
        
        {error && (
          <div className="translation-popup-error">
            {error}
          </div>
        )}
        
        {!loading && !error && dictionaryResult && (
          <div className="translation-popup-result">
            <div className="translation-popup-word-header">
              <span className="translation-popup-word">{dictionaryResult.word}</span>
              {dictionaryResult.phonetic && (
                <span className="translation-popup-phonetic"> /{dictionaryResult.phonetic}/</span>
              )}
            </div>
            
            {dictionaryResult.meanings && dictionaryResult.meanings.map((meaning, i) => (
              <div key={i} className="translation-popup-meaning">
                <div className="translation-popup-pos">{meaning.part_of_speech}</div>
                {meaning.definitions.map((def, j) => (
                  <div key={j} className="translation-popup-def-container">
                    <div className="translation-popup-definition">{j + 1}. {def.definition}</div>
                    {def.example && (
                      <div className="translation-popup-example">"{def.example}"</div>
                    )}
                    {def.synonyms && def.synonyms.length > 0 && (
                      <div className="translation-popup-synonyms">
                        {def.synonyms.map((syn, k) => (
                          <span key={k} className="translation-popup-chip">{syn}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
