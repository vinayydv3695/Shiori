import { useState } from 'react';
import { Book, BookOpen, Image, Settings, Sliders } from 'lucide-react';
import type { BookPrefs, MangaPrefs } from '../../../store/onboardingStore';
import { DEFAULT_READING_FONT_ID, READING_FONTS, normalizeLegacyFontPreference } from '../../../lib/readingFonts';
import GlowButton from '../components/GlowButton';
import SettingControl from '../components/SettingControl';
import SettingGroup from '../components/SettingGroup';

type PreferencesStepProps = {
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  onMangaChange: (updates: Partial<MangaPrefs>) => void;
  onBookChange: (updates: Partial<BookPrefs>) => void;
  onBack: () => void;
  onNext: () => void;
};

type ReaderTab = 'manga' | 'book';

const tabButtonClass = (active: boolean) =>
  `relative rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold transition-all duration-200 ${
    active
      ? 'bg-slate-900 text-white'
      : 'bg-transparent text-white/60 hover:bg-slate-900/60 hover:text-white/90'
  }`;

export function PreferencesStep({ mangaPrefs, bookPrefs, onMangaChange, onBookChange, onBack, onNext }: PreferencesStepProps) {
  const [activeTab, setActiveTab] = useState<ReaderTab>('manga');
  const normalizedBookFontFamily = normalizeLegacyFontPreference(bookPrefs.fontFamily);
  const selectedBookFontFamily = READING_FONTS.some((font) => font.id === normalizedBookFontFamily)
    ? normalizedBookFontFamily
    : DEFAULT_READING_FONT_ID;

  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-8 shadow-xl md:p-10">

      <div className="relative z-10">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Reader Preferences</h2>
        <p className="mt-2 text-white/60">Configure all manga and EPUB defaults before you start reading.</p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950 p-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={tabButtonClass(activeTab === 'manga')} onClick={() => setActiveTab('manga')}>
              <span className="flex items-center justify-center gap-2">
                <Image size={18} />
                Manga Reader
              </span>
            </button>
            <button type="button" className={tabButtonClass(activeTab === 'book')} onClick={() => setActiveTab('book')}>
              <span className="flex items-center justify-center gap-2">
                <BookOpen size={18} />
                Book/EPUB Reader
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 h-[28rem] overflow-y-auto pr-1">
          <div className="space-y-5">
            {activeTab === 'manga' ? (
              <>
                <SettingGroup
                  theme="darkSlate"
                  title="Reading Mode"
                  description="Choose how manga pages are presented."
                  icon={<Image size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Reading Mode"
                      description="Single, strip, webtoon, manhwa or comic mode"
                      type="select"
                      value={mangaPrefs.readingMode}
                      onChange={(value) => onMangaChange({ readingMode: String(value) as MangaPrefs['readingMode'] })}
                      options={[
                        { label: 'Single', value: 'single' },
                        { label: 'Strip', value: 'strip' },
                        { label: 'Webtoon', value: 'webtoon' },
                        { label: 'Manhwa', value: 'manhwa' },
                        { label: 'Comic', value: 'comic' },
                      ]}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Display Settings"
                  description="Control fit, spacing and reader chrome."
                  icon={<Settings size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Fit Mode"
                      type="select"
                      value={mangaPrefs.fitMode}
                      onChange={(value) => onMangaChange({ fitMode: String(value) as MangaPrefs['fitMode'] })}
                      options={[
                        { label: 'Fit Width', value: 'width' },
                        { label: 'Fit Height', value: 'height' },
                        { label: 'Contain', value: 'contain' },
                      ]}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Strip Margin"
                      type="slider"
                      value={mangaPrefs.stripMargin}
                      onChange={(value) => onMangaChange({ stripMargin: Number(value) })}
                      min={0}
                      max={64}
                      step={1}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Progress Bar Position"
                      type="radio"
                      value={mangaPrefs.progressBarPosition}
                      onChange={(value) => onMangaChange({ progressBarPosition: String(value) as MangaPrefs['progressBarPosition'] })}
                      options={[
                        { label: 'Top', value: 'top' },
                        { label: 'Bottom', value: 'bottom' },
                        { label: 'Hidden', value: 'hidden' },
                      ]}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Sticky Header"
                      type="toggle"
                      value={mangaPrefs.stickyHeader}
                      onChange={(value) => onMangaChange({ stickyHeader: Boolean(value) })}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Reading Direction"
                  description="Set page direction flow."
                  icon={<Sliders size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Direction"
                      type="radio"
                      value={mangaPrefs.readingDirection}
                      onChange={(value) => onMangaChange({ readingDirection: String(value) as MangaPrefs['readingDirection'] })}
                      options={[
                        { label: 'Right to Left', value: 'rtl' },
                        { label: 'Left to Right', value: 'ltr' },
                      ]}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Navigation"
                  description="Reader guidance and helper overlays."
                  icon={<Settings size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Show Navigation Tips"
                      type="toggle"
                      value={mangaPrefs.showNavigationTips}
                      onChange={(value) => onMangaChange({ showNavigationTips: Boolean(value) })}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Appearance"
                  description="Theme and image rendering defaults."
                  icon={<Image size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Theme"
                      type="radio"
                      value={mangaPrefs.theme}
                      onChange={(value) => onMangaChange({ theme: String(value) as MangaPrefs['theme'] })}
                      options={[
                        { label: 'Light', value: 'light' },
                        { label: 'Dark', value: 'dark' },
                      ]}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Image Quality"
                      type="select"
                      value={mangaPrefs.imageQuality}
                      onChange={(value) => onMangaChange({ imageQuality: String(value) as MangaPrefs['imageQuality'] })}
                      options={[
                        { label: 'Low', value: 'low' },
                        { label: 'Medium', value: 'medium' },
                        { label: 'High', value: 'high' },
                        { label: 'Original', value: 'original' },
                      ]}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Performance"
                  description="Balance memory and responsiveness."
                  icon={<Sliders size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Preload Intensity"
                      type="slider"
                      value={mangaPrefs.preloadIntensity}
                      onChange={(value) => onMangaChange({ preloadIntensity: Number(value) })}
                      min={0}
                      max={10}
                      step={1}
                    />
                </SettingGroup>

                <SettingGroup
                  theme="darkSlate"
                  title="Library Organization"
                  description="Manage how manga is grouped in your library."
                  icon={<Settings size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Auto Group Volumes"
                      description="Automatically group manga volumes together"
                      type="toggle"
                      value={mangaPrefs.autoGroupVolumes}
                      onChange={(value) => onMangaChange({ autoGroupVolumes: Boolean(value) })}
                    />
                </SettingGroup>
              </>
            ) : (
              <>
                <SettingGroup
                  theme="darkSlate"
                  title="Typography"
                  description="Font and text rendering preferences."
                  icon={<Book size={18} />}
                >
                    <SettingControl
                      theme="darkSlate"
                      label="Font Family"
                      type="select"
                      value={selectedBookFontFamily}
                      onChange={(value) => {
                        const normalized = normalizeLegacyFontPreference(String(value));
                        const canonicalId = READING_FONTS.some((font) => font.id === normalized) ? normalized : DEFAULT_READING_FONT_ID;
                        onBookChange({ fontFamily: canonicalId });
                      }}
                      options={READING_FONTS.map((font) => ({ label: font.label, value: font.id }))}
                    />
                    <SettingControl theme="darkSlate" label="Font Size" type="slider" value={bookPrefs.fontSize} onChange={(value) => onBookChange({ fontSize: Number(value) })} min={10} max={40} step={1} />
                    <SettingControl theme="darkSlate" label="Line Height" type="slider" value={bookPrefs.lineHeight} onChange={(value) => onBookChange({ lineHeight: Number(value) })} min={1} max={2.4} step={0.05} />
                    <SettingControl theme="darkSlate" label="Letter Spacing" type="slider" value={bookPrefs.letterSpacing} onChange={(value) => onBookChange({ letterSpacing: Number(value) })} min={-1} max={8} step={0.1} />
                    <SettingControl
                      theme="darkSlate"
                      label="Text Alignment"
                      type="radio"
                      value={bookPrefs.textAlignment}
                      onChange={(value) => onBookChange({ textAlignment: String(value) as BookPrefs['textAlignment'] })}
                      options={[
                        { label: 'Left', value: 'left' },
                        { label: 'Center', value: 'center' },
                        { label: 'Right', value: 'right' },
                        { label: 'Justify', value: 'justify' },
                      ]}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Text Justification"
                      type="select"
                      value={bookPrefs.textJustification}
                      onChange={(value) => onBookChange({ textJustification: String(value) as BookPrefs['textJustification'] })}
                      options={[
                        { label: 'Off', value: 'off' },
                        { label: 'On', value: 'on' },
                        { label: 'Auto', value: 'auto' },
                      ]}
                    />
                    <SettingControl
                      theme="darkSlate"
                      label="Hyphenation"
                      type="toggle"
                      value={bookPrefs.hyphenation}
                      onChange={(value) => onBookChange({ hyphenation: Boolean(value) })}
                    />
                </SettingGroup>

                <SettingGroup theme="darkSlate" title="Layout" description="Page geometry and flow." icon={<Settings size={18} />}>
                    <SettingControl theme="darkSlate" label="Page Width" type="slider" value={bookPrefs.pageWidth} onChange={(value) => onBookChange({ pageWidth: Number(value) })} min={320} max={1400} step={10} />
                    <SettingControl theme="darkSlate" label="Reading Width" type="slider" value={bookPrefs.readingWidth} onChange={(value) => onBookChange({ readingWidth: Number(value) })} min={320} max={1200} step={10} />
                    <SettingControl theme="darkSlate" label="Margin" type="slider" value={bookPrefs.margin} onChange={(value) => onBookChange({ margin: Number(value) })} min={0} max={100} step={1} />
                    <SettingControl theme="darkSlate" label="Paragraph Spacing" type="slider" value={bookPrefs.paragraphSpacing} onChange={(value) => onBookChange({ paragraphSpacing: Number(value) })} min={0} max={3} step={0.1} />
                    <SettingControl
                      theme="darkSlate"
                      label="Scroll Mode"
                      type="radio"
                      value={bookPrefs.scrollMode}
                      onChange={(value) => onBookChange({ scrollMode: String(value) as BookPrefs['scrollMode'] })}
                      options={[
                        { label: 'Paged', value: 'paged' },
                        { label: 'Continuous', value: 'continuous' },
                      ]}
                    />
                    <SettingControl theme="darkSlate" label="Two Page View" type="toggle" value={bookPrefs.twoPageView} onChange={(value) => onBookChange({ twoPageView: Boolean(value) })} />
                </SettingGroup>

                <SettingGroup theme="darkSlate" title="Appearance" description="Theme and visual styling." icon={<Image size={18} />}>
                    <SettingControl theme="darkSlate" label="Theme" type="select" value={bookPrefs.theme} onChange={(value) => onBookChange({ theme: String(value) as BookPrefs['theme'] })} options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }, { label: 'Sepia', value: 'sepia' }]} />
                    <SettingControl theme="darkSlate" label="Background Color" type="input" value={bookPrefs.backgroundColor} onChange={(value) => onBookChange({ backgroundColor: String(value) })} />
                    <SettingControl theme="darkSlate" label="Text Color" type="input" value={bookPrefs.textColor} onChange={(value) => onBookChange({ textColor: String(value) })} />
                    <SettingControl theme="darkSlate" label="Brightness" type="slider" value={bookPrefs.brightness} onChange={(value) => onBookChange({ brightness: Number(value) })} min={0} max={2} step={0.05} />
                    <SettingControl theme="darkSlate" label="Paper Texture Intensity" type="slider" value={bookPrefs.paperTextureIntensity} onChange={(value) => onBookChange({ paperTextureIntensity: Number(value) })} min={0} max={1} step={0.05} />
                </SettingGroup>

                <SettingGroup theme="darkSlate" title="Interaction" description="Transitions and UI behavior." icon={<Sliders size={18} />}>
                    <SettingControl theme="darkSlate" label="Page Transition Enabled" type="toggle" value={bookPrefs.pageTransitionEnabled} onChange={(value) => onBookChange({ pageTransitionEnabled: Boolean(value) })} />
                    <SettingControl theme="darkSlate" label="Page Transition Style" type="select" value={bookPrefs.pageTransitionStyle} onChange={(value) => onBookChange({ pageTransitionStyle: String(value) as BookPrefs['pageTransitionStyle'] })} options={[{ label: 'Slide', value: 'slide' }, { label: 'Fade', value: 'fade' }, { label: 'Curl', value: 'curl' }, { label: 'None', value: 'none' }]} />
                    <SettingControl theme="darkSlate" label="Page Transition Speed" type="slider" value={bookPrefs.pageTransitionSpeed} onChange={(value) => onBookChange({ pageTransitionSpeed: Number(value) })} min={50} max={1200} step={10} />
                    <SettingControl theme="darkSlate" label="Animation Speed" type="slider" value={bookPrefs.animationSpeed} onChange={(value) => onBookChange({ animationSpeed: Number(value) })} min={0} max={1000} step={10} />
                    <SettingControl theme="darkSlate" label="UI Scale" type="slider" value={bookPrefs.uiScale} onChange={(value) => onBookChange({ uiScale: Number(value) })} min={0.75} max={1.5} step={0.01} />
                </SettingGroup>

                <SettingGroup theme="darkSlate" title="Advanced" description="Inject custom styles into EPUB reader." icon={<Settings size={18} />}>
                    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                      <label htmlFor="book-custom-css" className="text-sm font-semibold text-white">Custom CSS</label>
                      <p className="mt-1 text-xs text-white/60">Applied on top of theme styles.</p>
                      <textarea
                        id="book-custom-css"
                        value={bookPrefs.customCSS}
                        onChange={(e) => onBookChange({ customCSS: e.target.value })}
                        className="mt-3 h-36 w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                        placeholder="body { font-variant-ligatures: common-ligatures; }"
                      />
                    </div>
                </SettingGroup>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
          <GlowButton theme="dark" onClick={onBack} variant="secondary" className="rounded-full px-6 py-3">
            ← Back
          </GlowButton>
          <GlowButton theme="dark" onClick={onNext} variant="primary" className="rounded-full px-8 py-3">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default PreferencesStep;
