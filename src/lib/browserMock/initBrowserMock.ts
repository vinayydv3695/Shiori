import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { mockBackend } from './mockBackend';

const SIMULATE_ANDROID_KEY = 'shiori_simulate_android';
const DEVICE_FRAME_KEY = 'shiori_sim_device_frame';
const DEVICE_PRESET_KEY = 'shiori_sim_device_preset';
const DEVICE_ORIENTATION_KEY = 'shiori_sim_device_orientation';

export type DevicePreset = 'phone' | 'tablet' | 'responsive';
export type DeviceOrientation = 'portrait' | 'landscape';

export function isBrowserMode(): boolean {
  if (typeof window === 'undefined') return false;
  // If native Tauri was injected by the Rust webview runtime, it's not browser mode
  if ((window as any).__TAURI__ || ((window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI_IS_MOCK__)) {
    return false;
  }
  return true;
}

export function isSimulatedAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isBrowserMode()) return false;

  // 1. Check URL query param: ?android=true or ?android
  const search = new URLSearchParams(window.location.search);
  if (search.has('android')) {
    return search.get('android') !== 'false';
  }

  // 2. Check localStorage
  const stored = localStorage.getItem(SIMULATE_ANDROID_KEY);
  if (stored !== null) {
    return stored === 'true';
  }

  // 3. Default to true in browser mode so developer can immediately test Android features
  return true;
}

export function toggleSimulatedAndroid(enabled?: boolean): void {
  const current = isSimulatedAndroid();
  const next = enabled !== undefined ? enabled : !current;
  localStorage.setItem(SIMULATE_ANDROID_KEY, String(next));
  window.location.reload();
}

export function getDevicePreset(): DevicePreset {
  if (typeof window === 'undefined') return 'phone';
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.has('responsive')) return 'responsive';
    const p = search.get('preset');
    if (p === 'phone' || p === 'tablet' || p === 'responsive') return p;
  } catch {
    // Ignore URL parse errors
  }
  const stored = localStorage.getItem(DEVICE_PRESET_KEY) as DevicePreset | null;
  return stored || 'phone';
}

export function setDevicePreset(preset: DevicePreset): void {
  localStorage.setItem(DEVICE_PRESET_KEY, preset);
  window.dispatchEvent(new CustomEvent('shiori-sim-config-change'));
}

export function getDeviceOrientation(): DeviceOrientation {
  if (typeof window === 'undefined') return 'portrait';
  const stored = localStorage.getItem(DEVICE_ORIENTATION_KEY) as DeviceOrientation | null;
  return stored || 'portrait';
}

export function setDeviceOrientation(orientation: DeviceOrientation): void {
  localStorage.setItem(DEVICE_ORIENTATION_KEY, orientation);
  window.dispatchEvent(new CustomEvent('shiori-sim-config-change'));
}

export function isDeviceFrameEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(DEVICE_FRAME_KEY);
  if (stored !== null) return stored === 'true';
  return true; // Default to showing frame in browser desktop viewport
}

export function setDeviceFrameEnabled(enabled: boolean): void {
  localStorage.setItem(DEVICE_FRAME_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent('shiori-sim-config-change'));
}

export function initBrowserMock(): void {
  if (typeof window === 'undefined') return;

  // Do not override if running inside real native Tauri
  if (!isBrowserMode()) {
    return;
  }

  const isSimAndroid = isSimulatedAndroid();
  console.info(`[Shiori Browser Simulator] Active: ${isSimAndroid ? 'Android 14' : 'Desktop Linux'} mode`);

  (window as any).__TAURI_IS_MOCK__ = true;

  // Initialize Tauri mocks
  mockWindows('main');
  mockIPC((cmd, args) => mockBackend.handleInvoke(cmd, args), { shouldMockEvents: true });

  // Ensure convertFileSrc is available on __TAURI_INTERNALS__
  if ((window as any).__TAURI_INTERNALS__) {
    (window as any).__TAURI_INTERNALS__.convertFileSrc = (url: string) => url;
    (window as any).__TAURI_INTERNALS__.platform = isSimAndroid ? 'android' : 'linux';
  }

  // Set OS plugin internals for reliable Android detection
  (window as any).__TAURI_OS_PLUGIN_INTERNALS__ = {
    os_type: isSimAndroid ? 'android' : 'linux',
  };

  if (isSimAndroid) {
    document.documentElement.classList.add('is-android');
  } else {
    document.documentElement.classList.remove('is-android');
  }
}

const proc = (globalThis as unknown as { process?: { env?: { NODE_ENV?: string; VITEST?: string } } }).process;
const isTestEnv = !!(proc && (proc.env?.NODE_ENV === 'test' || proc.env?.VITEST));

// Auto-initialize when imported in browser environment (excluding tests)
if (typeof window !== 'undefined' && isBrowserMode() && !isTestEnv) {
  initBrowserMock();
}
