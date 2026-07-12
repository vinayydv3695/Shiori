import { isAndroid } from '@/lib/tauri';
import { AniListAuthProvider } from './AniListProvider';
import { AniListDesktopProvider } from './desktop/AniListDesktopProvider';
export const anilistAuth: AniListAuthProvider = new AniListDesktopProvider();

export * from './AniListProvider';
