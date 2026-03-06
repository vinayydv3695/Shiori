import { useState, useRef, useEffect } from 'react';
import { useReadingSettings, type ReaderTheme } from '@/store/premiumReaderStore';
import { Settings, Columns, ChevronDown, ChevronUp } from '@/components/icons';

export type ReaderFormat = 'epub' | 'pdf' | 'mobi' | 'manga' | 'fb2' | 'docx' | 'html' | 'htm' | 'txt' | 'md' | 'markdown';

interface ReaderSettingsProps {
  /** Current book format — controls which settings are visible */
  format?: ReaderFormat;
}

export function ReaderSettings({ format = 'epub' }: ReaderSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    theme,
    fontFamily,
    fontSize,
    lineHeight,
    width,
    twoPageView,
    pageFlipEnabled,
    pageFlipSpeed,
    animationStyle,
    paperTextureIntensity,
    uiScale,
    textAlign,
    setTheme,
    setFontFamily,
    setFontSize,
    setLineHeight,
    setWidth,
    toggleTwoPageView,
    setPageFlipEnabled,
    setPageFlipSpeed,
    setAnimationStyle,
    setPaperTextureIntensity,
    setUiScale,
    setTextAlign,
  } = useReadingSettings();

  // Format helpers: which sections are relevant
  const showTypography = format === 'epub' || format === 'mobi';
  const showLayout = format === 'epub';
  const showPageTransition = format === 'epub';

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const fontOptions = [
    { id: 'literata', name: 'Literata', label: 'Literata (Serif)' },
    { id: 'merriweather', name: 'Merriweather', label: 'Merriweather (Serif)' },
    { id: 'lora', name: 'Lora', label: 'Lora (Serif)' },
    { id: 'serif', name: 'Georgia', label: 'Georgia (Serif)' },
    { id: 'opensans', name: 'Open Sans', label: 'Open Sans (Sans)' },
    { id: 'sans', name: 'Arial', label: 'Arial (Sans)' },
    { id: 'system', name: 'System', label: 'System Font' },
    { id: 'mono', name: 'Monospace', label: 'Monospace' },
  ];

  const widthOptions: Array<{ id: 'narrow' | 'medium' | 'wide' | 'full'; label: string; chars: string }> = [
    { id: 'narrow', label: 'Narrow', chars: '45ch' },
    { id: 'medium', label: 'Medium', chars: '60ch' },
    { id: 'wide', label: 'Wide', chars: '75ch' },
    { id: 'full', label: 'Full', chars: '100%' },
  ];

  return (
    <div className="premium-settings-container">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`premium-control-button ${isOpen ? 'premium-control-button--active' : ''}`}
        aria-label="Settings"
        title="Reading settings"
      >
        <Settings className="premium-control-icon" />
      </button>

      {isOpen && (
        <div ref={panelRef} className="premium-settings-panel">
          {/* Theme Selection — all formats */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">Theme</label>
            <div className="premium-settings-width-grid">
              {[
                {
                  id: 'light' as ReaderTheme,
                  label: 'Light',
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  ),
                },
                {
                  id: 'dark' as ReaderTheme,
                  label: 'Dark',
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ),
                },
                {
                  id: 'paper' as ReaderTheme,
                  label: 'Paper',
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  ),
                },
                {
                  id: 'paper-dark' as ReaderTheme,
                  label: 'Paper Dark',
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  ),
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  className={`premium-settings-width-option ${theme === opt.id ? 'premium-settings-width-option--active' : ''}`}
                >
                  {opt.icon}
                  <span className="premium-settings-option-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Family — EPUB/MOBI only */}
          {showTypography && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">Font Family</label>
              <div className="premium-settings-font-grid">
                {fontOptions.map((font) => (
                  <button
                    key={font.id}
                    onClick={() => setFontFamily(font.id)}
                    className={`premium-settings-font-option ${fontFamily === font.id ? 'premium-settings-font-option--active' : ''}`}
                    style={{ fontFamily: font.name }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Font Size — EPUB/MOBI only */}
          {showTypography && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">
                Font Size
                <span className="premium-settings-value">{fontSize}px</span>
              </label>
              <div className="premium-settings-slider-container">
                <button
                  onClick={() => setFontSize(fontSize - 1)}
                  className="premium-settings-slider-button"
                  disabled={fontSize <= 12}
                >
                  <ChevronDown className="premium-settings-slider-icon" />
                </button>
                <input
                  type="range"
                  min="12"
                  max="32"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="premium-settings-slider"
                />
                <button
                  onClick={() => setFontSize(fontSize + 1)}
                  className="premium-settings-slider-button"
                  disabled={fontSize >= 32}
                >
                  <ChevronUp className="premium-settings-slider-icon" />
                </button>
              </div>
            </div>
          )}

          {/* Line Height — EPUB/MOBI only */}
          {showTypography && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">
                Line Height
                <span className="premium-settings-value">{lineHeight.toFixed(1)}</span>
              </label>
              <div className="premium-settings-slider-container">
                <button
                  onClick={() => setLineHeight(Math.max(1.2, lineHeight - 0.1))}
                  className="premium-settings-slider-button"
                  disabled={lineHeight <= 1.2}
                >
                  <ChevronDown className="premium-settings-slider-icon" />
                </button>
                <input
                  type="range"
                  min="1.2"
                  max="2.0"
                  step="0.1"
                  value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="premium-settings-slider"
                />
                <button
                  onClick={() => setLineHeight(Math.min(2.0, lineHeight + 0.1))}
                  className="premium-settings-slider-button"
                  disabled={lineHeight >= 2.0}
                >
                  <ChevronUp className="premium-settings-slider-icon" />
                </button>
              </div>
            </div>
          )}

          {/* Text Alignment — EPUB/MOBI only */}
          {showTypography && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">Text Alignment</label>
              <div className="premium-settings-width-grid">
                {([
                  {
                    id: 'left' as const,
                    label: 'Left',
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="17" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="17" y1="18" x2="3" y2="18" />
                      </svg>
                    ),
                  },
                  {
                    id: 'justify' as const,
                    label: 'Justify',
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="21" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="21" y1="18" x2="3" y2="18" />
                      </svg>
                    ),
                  },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTextAlign(opt.id)}
                    className={`premium-settings-width-option ${textAlign === opt.id ? 'premium-settings-width-option--active' : ''}`}
                  >
                    {opt.icon}
                    <span className="premium-settings-option-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reading Width — EPUB/MOBI only */}
          {showTypography && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">Reading Width</label>
              <div className="premium-settings-width-grid">
                {widthOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setWidth(option.id)}
                    className={`premium-settings-width-option ${width === option.id ? 'premium-settings-width-option--active' : ''}`}
                  >
                    <svg className="premium-settings-option-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 4h12M2 8h12M2 12h12" />
                    </svg>
                    <span className="premium-settings-option-label">{option.label}</span>
                    <span className="premium-settings-option-sublabel">{option.chars}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Two-Page View — EPUB only */}
          {showLayout && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">Layout</label>
              <button
                onClick={toggleTwoPageView}
                className={`premium-settings-toggle ${twoPageView ? 'premium-settings-toggle--active' : ''}`}
              >
                <Columns className="premium-settings-icon" />
                <span>Two-Page View</span>
              </button>
            </div>
          )}

          {/* Page Transition — EPUB only */}
          {showPageTransition && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">Page Transition</label>
              <button
                onClick={() => setPageFlipEnabled(!pageFlipEnabled)}
                className={`premium-settings-toggle ${pageFlipEnabled ? 'premium-settings-toggle--active' : ''}`}
              >
                <svg className="premium-settings-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <span>Enable Page Transition</span>
              </button>
              {pageFlipEnabled && (
                <>
                  <div className="premium-settings-width-grid" style={{ marginTop: 8 }}>
                    {([
                      { id: 'slide' as const, label: 'Slide' },
                      { id: 'fade' as const, label: 'Fade' },
                      { id: 'none' as const, label: 'Instant' },
                    ]).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setAnimationStyle(opt.id)}
                        className={`premium-settings-width-option ${animationStyle === opt.id ? 'premium-settings-width-option--active' : ''}`}
                      >
                        <span className="premium-settings-option-label">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {animationStyle !== 'none' && (
                    <div className="premium-settings-slider-container" style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Speed</span>
                      <input
                        type="range"
                        min="100"
                        max="800"
                        step="50"
                        value={pageFlipSpeed}
                        onChange={(e) => setPageFlipSpeed(Number(e.target.value))}
                        className="premium-settings-slider"
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{pageFlipSpeed}ms</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paper Texture Intensity — paper themes only, all formats */}
          {(theme === 'paper' || theme === 'paper-dark') && (
            <div className="premium-settings-section">
              <label className="premium-settings-label">
                Texture Intensity
                <span className="premium-settings-value">{(paperTextureIntensity * 100).toFixed(0)}%</span>
              </label>
              <div className="premium-settings-slider-container">
                <input
                  type="range"
                  min="0"
                  max="0.20"
                  step="0.01"
                  value={paperTextureIntensity}
                  onChange={(e) => setPaperTextureIntensity(Number(e.target.value))}
                  className="premium-settings-slider"
                />
              </div>
            </div>
          )}

          {/* UI Scale — all formats */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">
              UI Scale
              <span className="premium-settings-value">{uiScale.toFixed(1)}x</span>
            </label>
            <div className="premium-settings-slider-container">
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={uiScale}
                onChange={(e) => setUiScale(Number(e.target.value))}
                className="premium-settings-slider"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
