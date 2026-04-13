export interface ReadingFontDefinition {
  id: string;
  label: string;
  previewFamily: string;
  cssStack: string;
}

export const DEFAULT_READING_FONT_ID = 'literata';

export const READING_FONTS: ReadingFontDefinition[] = [
  { id: 'literata', label: 'Literata', previewFamily: '"Literata"', cssStack: '"Literata", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  { id: 'merriweather', label: 'Merriweather', previewFamily: '"Merriweather"', cssStack: '"Merriweather", "Iowan Old Style", Georgia, serif' },
  { id: 'lora', label: 'Lora', previewFamily: '"Lora"', cssStack: '"Lora", Georgia, "Times New Roman", serif' },
  { id: 'source-serif-4', label: 'Source Serif 4', previewFamily: '"Source Serif 4"', cssStack: '"Source Serif 4", "Source Serif Pro", "Noto Serif", Georgia, serif' },
  { id: 'eb-garamond', label: 'EB Garamond', previewFamily: '"EB Garamond"', cssStack: '"EB Garamond", Garamond, "Times New Roman", serif' },
  { id: 'crimson-pro', label: 'Crimson Pro', previewFamily: '"Crimson Pro"', cssStack: '"Crimson Pro", "Times New Roman", Times, serif' },
  { id: 'libre-baskerville', label: 'Libre Baskerville', previewFamily: '"Libre Baskerville"', cssStack: '"Libre Baskerville", Baskerville, "Times New Roman", serif' },
  { id: 'pt-serif', label: 'PT Serif', previewFamily: '"PT Serif"', cssStack: '"PT Serif", "Times New Roman", Times, serif' },
  { id: 'noto-serif', label: 'Noto Serif', previewFamily: '"Noto Serif"', cssStack: '"Noto Serif", "Noto Serif Display", "Droid Serif", Georgia, serif' },
  { id: 'charter', label: 'Charter', previewFamily: 'Charter', cssStack: '"Bitstream Charter", Charter, "Sitka Text", Cambria, "Times New Roman", Times, serif' },
  { id: 'serif', label: 'Serif (Georgia)', previewFamily: 'Georgia', cssStack: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'opensans', label: 'Open Sans', previewFamily: '"Open Sans"', cssStack: '"Open Sans", "Noto Sans", Arial, sans-serif' },
  { id: 'source-sans-3', label: 'Source Sans 3', previewFamily: '"Source Sans 3"', cssStack: '"Source Sans 3", "Source Sans Pro", "Noto Sans", Arial, sans-serif' },
  { id: 'atkinson-hyperlegible', label: 'Atkinson Hyperlegible', previewFamily: '"Atkinson Hyperlegible"', cssStack: '"Atkinson Hyperlegible", "Verdana Pro", Verdana, "Noto Sans", sans-serif' },
  { id: 'noto-sans', label: 'Noto Sans', previewFamily: '"Noto Sans"', cssStack: '"Noto Sans", "Noto Sans Display", Arial, sans-serif' },
  { id: 'inter', label: 'Inter', previewFamily: 'Inter', cssStack: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'sans', label: 'Sans (Arial)', previewFamily: 'Arial', cssStack: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { id: 'system', label: 'System UI', previewFamily: 'system-ui', cssStack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'mono', label: 'Monospace', previewFamily: '"Courier New"', cssStack: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
];

const FONT_BY_ID = new Map(READING_FONTS.map((font) => [font.id, font]));

const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ');

const LEGACY_FONT_ALIASES: Record<string, string> = {
  'georgia, serif': 'serif',
  georgia: 'serif',
  'arial, sans-serif': 'sans',
  arial: 'sans',
  'times new roman': 'source-serif-4',
  times: 'source-serif-4',
  'palatino linotype': 'libre-baskerville',
  palatino: 'libre-baskerville',
  'bookman old style': 'crimson-pro',
  'courier new': 'mono',
  courier: 'mono',
  verdana: 'source-sans-3',
  literata: 'literata',
  merriweather: 'merriweather',
  lora: 'lora',
  opensans: 'opensans',
  'open sans': 'opensans',
  sans: 'sans',
  serif: 'serif',
  system: 'system',
  mono: 'mono',
  inter: 'inter',
};

for (const font of READING_FONTS) {
  LEGACY_FONT_ALIASES[normalizeValue(font.id)] = font.id;
  LEGACY_FONT_ALIASES[normalizeValue(font.cssStack)] = font.id;
  LEGACY_FONT_ALIASES[normalizeValue(font.previewFamily)] = font.id;
}

export const normalizeLegacyFontPreference = (value: string): string => {
  if (!value) return DEFAULT_READING_FONT_ID;
  const normalized = normalizeValue(value);
  return LEGACY_FONT_ALIASES[normalized] ?? value;
};

export const resolveReadingFontCss = (idOrCss: string): string => {
  const normalized = normalizeLegacyFontPreference(idOrCss);
  const font = FONT_BY_ID.get(normalized);
  if (font) {
    return font.cssStack;
  }
  if (idOrCss?.includes(',')) {
    return idOrCss;
  }
  return FONT_BY_ID.get(DEFAULT_READING_FONT_ID)?.cssStack ?? 'Georgia, serif';
};
