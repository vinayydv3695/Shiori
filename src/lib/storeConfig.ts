/**
 * Build configuration flags for app stores (e.g., Microsoft Store, Google Play).
 * 
 * In Store builds:
 * - Shadow libraries and piracy sources (LibGen, Anna's Archive, Nyaa, etc.) are stripped.
 * - Torrenting and debrid services (Torbox) are completely hidden.
 * - Unlicensed manga scrapers are hidden by default; Project Gutenberg and local files remain active.
 * - In-app auto-update checks via GitHub Releases are replaced with Microsoft Store update notices.
 */
export const IS_STORE_BUILD: boolean =
  import.meta.env.VITE_STORE_BUILD === 'true' ||
  import.meta.env.VITE_MICROSOFT_STORE === 'true';
