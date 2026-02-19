import { useState, useRef, useEffect } from 'react';
import { useReadingSettings } from '@/store/premiumReaderStore';
import { Sun, Moon, Settings, Columns, ChevronDown, ChevronUp } from '@/components/icons';

export function ReaderSettings() {
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
    toggleTheme,
    setFontFamily,
    setFontSize,
    setLineHeight,
    setWidth,
    toggleTwoPageView,
  } = useReadingSettings();
  
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
          {/* Theme Toggle */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">Theme</label>
            <button
              onClick={toggleTheme}
              className="premium-settings-theme-button"
            >
              {theme === 'light' ? (
                <>
                  <Sun className="premium-settings-icon" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="premium-settings-icon" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
          
          {/* Font Family */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">Font Family</label>
            <div className="premium-settings-font-grid">
              {fontOptions.map((font) => (
                <button
                  key={font.id}
                  onClick={() => setFontFamily(font.id)}
                  className={`premium-settings-font-option ${
                    fontFamily === font.id ? 'premium-settings-font-option--active' : ''
                  }`}
                  style={{ fontFamily: font.name }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Font Size */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">
              Font Size
              <span className="premium-settings-value">{fontSize}px</span>
            </label>
            <div className="premium-settings-slider-container">
              <button
                onClick={() => setFontSize(fontSize - 1)}
                className="premium-settings-slider-button"
                disabled={fontSize <= 14}
              >
                <ChevronDown className="premium-settings-slider-icon" />
              </button>
              <input
                type="range"
                min="14"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="premium-settings-slider"
              />
              <button
                onClick={() => setFontSize(fontSize + 1)}
                className="premium-settings-slider-button"
                disabled={fontSize >= 24}
              >
                <ChevronUp className="premium-settings-slider-icon" />
              </button>
            </div>
          </div>
          
          {/* Line Height */}
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
          
          {/* Width Preset */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">Reading Width</label>
            <div className="premium-settings-width-grid">
              {widthOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setWidth(option.id)}
                  className={`premium-settings-width-option ${
                    width === option.id ? 'premium-settings-width-option--active' : ''
                  }`}
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
          
          {/* Two-Page View */}
          <div className="premium-settings-section">
            <label className="premium-settings-label">Layout</label>
            <button
              onClick={toggleTwoPageView}
              className={`premium-settings-toggle ${
                twoPageView ? 'premium-settings-toggle--active' : ''
              }`}
            >
              <Columns className="premium-settings-icon" />
              <span>Two-Page View</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
