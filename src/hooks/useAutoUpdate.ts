import { useEffect } from 'react';
import { isAndroid, isTauri } from '@/lib/tauri';
import { check } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useUpdateStore } from '@/store/updateStore';
import { logger } from '@/lib/logger';

// Helper function to compare semver strings (e.g., "1.61.6" vs "1.62.0")
function isNewerVersion(current: string, latest: string) {
  const cParts = current.replace(/^v/, '').split('.').map(Number);
  const lParts = latest.replace(/^v/, '').split('.').map(Number);
  
  for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
    const c = cParts[i] || 0;
    const l = lParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export function useAutoUpdate() {
  const { setIsChecking, setUpdateInfo, setIsUpdateDialogOpen } = useUpdateStore();

  useEffect(() => {
    let mounted = true;

    const checkUpdates = async () => {
      // Small delay on startup so we don't block critical rendering
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (!mounted) return;

      try {
        setIsChecking(true);

        if (!isTauri) {
           // Not in Tauri app, no updates to check
           return;
        }

        if (import.meta.env.DEV) {
           logger.debug('[AutoUpdate] Skipping update check in DEV mode');
           return;
        }

        if (isAndroid) {
          // Custom Android APK check via GitHub Releases API
          logger.info('[AutoUpdate] Checking Android updates via GitHub...');
          const response = await fetch('https://api.github.com/repos/vinayydv3695/Shiori-releases/releases/latest');
          if (!response.ok) throw new Error('Failed to fetch latest release');
          
          const data = await response.json();
          const currentVersion = await getVersion();
          
          if (isNewerVersion(currentVersion, data.tag_name)) {
            // Pick the APK matching this device's ABI. Releases since 2.3.47
            // ship per-ABI APKs (app-arm64-v8a-*.apk, app-armeabi-v7a-*.apk)
            // with no universal build — the first .apk asset is NOT
            // guaranteed to be installable on this device.
            const arch = await invoke<string>('device_arch');
            const abiKeywordsMap: Record<string, string[]> = {
              aarch64: ['arm64-v8a', 'arm64', 'aarch64'],
              arm: ['armeabi-v7a', 'armv7', 'arm32', 'arm'],
              x86_64: ['x86_64'],
              x86: ['x86', 'i686'],
            };
            const wantKeywords = abiKeywordsMap[arch] || [arch];
            const apkAsset = data.assets.find(
              (a: any) => {
                if (!a.name.endsWith('.apk')) return false;
                const lowerName = a.name.toLowerCase();
                if (arch === 'arm' && (lowerName.includes('arm64') || lowerName.includes('aarch64'))) {
                  return false;
                }
                return wantKeywords.some(kw => lowerName.includes(kw.toLowerCase()));
              }
            );
            if (apkAsset && mounted) {
              // GitHub release assets publish a `digest` field as `sha256:<hex>`
              const digest: string | undefined = apkAsset.digest;
              setUpdateInfo({
                version: data.tag_name,
                notes: data.body || 'No release notes provided.',
                apkUrl: apkAsset.browser_download_url,
                apkSha256: digest ? digest.replace(/^sha256:/i, '').trim() : undefined
              });
              setIsUpdateDialogOpen(true);
            }
          }
        } else {
          // Desktop check via Tauri plugin
          logger.info('[AutoUpdate] Checking Desktop updates via Tauri plugin...');
          const update = await check();
          
          if (update && update.available && mounted) {
            let notes = update.body || '';
            if (!notes || notes.trim().length < 20) {
              try {
                const rawVer = update.version.replace(/^v/, '');
                const res = await fetch(`https://api.github.com/repos/vinayydv3695/Shiori-releases/releases/tags/v${rawVer}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data.body) notes = data.body;
                }
              } catch {
                // fallback to default
              }
            }

            setUpdateInfo({
              version: update.version,
              notes: notes || 'No release notes provided.',
              desktopUpdate: update
            });
            setIsUpdateDialogOpen(true);
          }
        }
      } catch (err) {
        logger.error('[AutoUpdate] Failed to check for updates:', err);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    checkUpdates();

    return () => {
      mounted = false;
    };
  }, [setIsChecking, setUpdateInfo, setIsUpdateDialogOpen]);
}
