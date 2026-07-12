import { isAndroid } from '@/lib/tauri';
import { AniListAuthProvider } from './AniListProvider';
import { AniListDesktopProvider } from './desktop/AniListDesktopProvider';
import { AniListAndroidProvider } from './android/AniListAndroidProvider';

export const anilistAuth: AniListAuthProvider = new AniListDesktopProvider();

export * from './AniListProvider';
