/**
 * Cloudflare session management — TypeScript frontend bindings.
 *
 * This module wraps the Tauri IPC commands exposed by the Rust cloudflare
 * module.  Import from `@/cloudflare` anywhere in the Shiori UI.
 */

import { invoke } from '@tauri-apps/api/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CfSessionStatus {
  host: string;
  hasSession: boolean;
  hasClearance: boolean;
  isExpired: boolean;
  capturedAt: string | null;
  userAgent: string | null;
  cookieCount: number;
}

export interface SolveResult {
  success: boolean;
  host: string;
  cookieCount: number;
  userAgent: string;
  message: string;
}

export type SolveMode = 'auto' | 'headless' | 'visible';

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Get the current CF session status for a URL (e.g. "https://www.toongod.org").
 */
export async function getCfSessionStatus(url: string): Promise<CfSessionStatus> {
  return invoke<CfSessionStatus>('cf_session_status', { url });
}

/**
 * Launch the Playwright browser to solve the CF challenge.
 *
 * - `mode = 'auto'`     → try headless first, fall back to visible (default).
 * - `mode = 'headless'` → headless only (may fail on aggressive CF configs).
 * - `mode = 'visible'`  → always show the browser window.
 *
 * This can take up to 60 seconds. Show a loading indicator in the UI.
 */
export async function solveCfChallenge(
  url: string,
  mode: SolveMode = 'auto',
): Promise<SolveResult> {
  const headlessOnly = mode === 'headless';
  return invoke<SolveResult>('cf_solve', { url, headlessOnly });
}

/**
 * Invalidate (delete) the stored CF session for a URL.
 * The next request will re-trigger the solver.
 */
export async function invalidateCfSession(url: string): Promise<string> {
  return invoke<string>('cf_invalidate_session', { url });
}

/**
 * Delete all stored CF sessions.
 */
export async function clearAllCfSessions(): Promise<string> {
  return invoke<string>('cf_clear_all_sessions');
}

/**
 * List all hosts with a stored session.
 */
export async function listCfSessions(): Promise<CfSessionStatus[]> {
  return invoke<CfSessionStatus[]>('cf_list_sessions');
}

/**
 * Proxy a manga image URL through the CF-authenticated backend.
 * Returns a data URL (base64-encoded image) for use in <img> tags.
 *
 * @param imageUrl       - Full URL of the image (e.g. ToonGod CDN URL).
 * @param sourceBaseUrl  - Base URL of the source site (e.g. "https://www.toongod.org").
 */
export async function proxyCfImage(
  imageUrl: string,
  sourceBaseUrl: string,
): Promise<string> {
  const bytes = await invoke<number[]>('cf_proxy_image', { imageUrl, sourceBaseUrl });
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

// ─── Convenience hook ─────────────────────────────────────────────────────────

/**
 * Ensure a valid CF session exists for `url`.
 * If the session is missing or expired, automatically triggers the solver.
 *
 * Returns `true` if a valid session now exists.
 */
export async function ensureCfSession(
  url: string,
  mode: SolveMode = 'auto',
): Promise<boolean> {
  try {
    const status = await getCfSessionStatus(url);
    if (status.hasSession && status.hasClearance && !status.isExpired) {
      return true;
    }
    const result = await solveCfChallenge(url, mode);
    return result.success;
  } catch (err) {
    console.error('[CF] ensureCfSession failed:', err);
    return false;
  }
}
