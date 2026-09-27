/**
 * readingPacing.ts — Reading speed and time estimation for Shiori reader.
 *
 * Implements dynamic WPM (words per minute) calculation and Kindle/Apple Books
 * style "Time Left in Chapter" and "Time Left in Book" pacing estimates.
 */

const DEFAULT_WPM = 220;
const MIN_WPM = 90;
const MAX_WPM = 800;
const WPM_STORAGE_KEY = 'shiori_user_reading_wpm';
const READOUT_MODE_KEY = 'shiori_progress_readout_mode';

export type ReadoutMode = 'chapter' | 'book' | 'percent' | 'session';

export const READOUT_MODES: ReadoutMode[] = ['chapter', 'book', 'percent', 'session'];

/** Safely counts words from raw text or rendered HTML string. */
export function countWordsFromHtml(content: string | null | undefined): number {
  if (!content) return 0;
  // Strip tags and decode spacing
  const plain = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return 0;
  return plain.split(' ').length;
}

/** Retrieve saved user WPM or fallback to default 220 WPM. */
export function getStoredWpm(): number {
  try {
    const val = localStorage.getItem(WPM_STORAGE_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed) && parsed >= MIN_WPM && parsed <= MAX_WPM) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_WPM;
}

/** Updates user WPM with an exponential moving average sample. */
export function recordReadingSample(wordsTraversed: number, elapsedSeconds: number): number {
  if (elapsedSeconds < 20 || wordsTraversed < 30) return getStoredWpm();
  
  const sampleWpm = Math.round((wordsTraversed / elapsedSeconds) * 60);
  if (sampleWpm < MIN_WPM || sampleWpm > MAX_WPM) return getStoredWpm();

  const currentWpm = getStoredWpm();
  // 85% current average + 15% new sample to keep pacing smooth without erratic jumps
  const updatedWpm = Math.round(currentWpm * 0.85 + sampleWpm * 0.15);

  try {
    localStorage.setItem(WPM_STORAGE_KEY, updatedWpm.toString());
  } catch {
    // ignore
  }

  return updatedWpm;
}

/** Format remaining minutes into a clean, human-readable string. */
export function formatTimeRemaining(totalMinutes: number, compact: boolean = false): string {
  if (totalMinutes <= 0) {
    return compact ? '< 1m' : '< 1 min';
  }
  if (totalMinutes < 60) {
    return compact ? `${totalMinutes}m` : `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return compact ? `${hours}h ${mins}m` : `${hours} hr ${mins} min`;
}

/** Calculates estimated minutes to read a given word count. */
export function calculateMinutesLeft(remainingWords: number, wpm: number = getStoredWpm()): number {
  if (remainingWords <= 0) return 0;
  return Math.ceil(remainingWords / Math.max(MIN_WPM, wpm));
}

/** Retrieve persisted readout display mode. */
export function getStoredReadoutMode(): ReadoutMode {
  try {
    const saved = localStorage.getItem(READOUT_MODE_KEY);
    if (saved && (READOUT_MODES as string[]).includes(saved)) {
      return saved as ReadoutMode;
    }
  } catch {
    // ignore
  }
  return 'chapter';
}

/** Persist preferred readout display mode. */
export function setStoredReadoutMode(mode: ReadoutMode): void {
  try {
    localStorage.setItem(READOUT_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
