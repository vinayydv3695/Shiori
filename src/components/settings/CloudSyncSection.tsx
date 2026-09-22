import React, { useState, useEffect } from 'react';
import { WebDAVClient, type WebDAVConfig, type ShioriSyncPayload } from '@/lib/sync/webdavClient';
import { 
  Cloud, 
  Check, 
  RefreshCw, 
  Server, 
  User, 
  Key, 
  Folder, 
  ShieldCheck, 
  Save, 
  Eye, 
  EyeOff 
} from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { api } from '@/lib/tauri';
import { SettingSection, SettingItem } from './SettingsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CloudSyncSection() {
  const [config, setConfig] = useState<WebDAVConfig>({
    url: '',
    username: '',
    password: '',
    syncFolder: '/ShioriSync/',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('shiori-webdav-config');
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch {}
    }
    const lastSync = localStorage.getItem('shiori-webdav-last-sync');
    if (lastSync) {
      setLastSyncTime(lastSync);
    }
  }, []);

  const handleSaveConfig = () => {
    localStorage.setItem('shiori-webdav-config', JSON.stringify(config));
    useToastStore.getState().addToast({
      title: 'Credentials Saved',
      description: 'WebDAV sync settings saved successfully.',
      variant: 'success',
    });
  };

  const handleTestConnection = async () => {
    if (!config.url || !config.username) {
      useToastStore.getState().addToast({
        title: 'Missing Details',
        description: 'Please enter a WebDAV URL and username.',
        variant: 'error',
      });
      return;
    }

    setTesting(true);
    try {
      const res = await WebDAVClient.testConnection(config);
      if (res.ok) {
        useToastStore.getState().addToast({
          title: 'Connected to WebDAV',
          description: 'Successfully reached server.',
          variant: 'success',
        });
      } else {
        useToastStore.getState().addToast({
          title: 'Connection Failed',
          description: res.message,
          variant: 'error',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!config.url || !config.username) {
      useToastStore.getState().addToast({
        title: 'Setup Required',
        description: 'Please configure your WebDAV URL and credentials first.',
        variant: 'error',
      });
      return;
    }

    setSyncing(true);
    try {
      // 1. Fetch local reading progress
      const books = await api.getBooks();
      const progressList: ShioriSyncPayload['progressList'] = [];

      for (const book of books) {
        if (book.id === undefined) continue;
        try {
          const prog = await api.getReadingProgress(book.id);
          if (prog) {
            progressList.push({
              bookId: book.id,
              currentPage: prog.currentPage || 0,
              progressPercent: prog.progressPercent || 0,
              lastRead: prog.lastRead || new Date().toISOString(),
            });
          }
        } catch {}
      }

      const payload: ShioriSyncPayload = {
        version: 1,
        timestamp: Date.now(),
        deviceId: 'shiori-desktop',
        progressList,
        bookmarks: [],
      };

      await WebDAVClient.uploadPayload(config, payload);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(timeStr);
      localStorage.setItem('shiori-webdav-last-sync', timeStr);

      useToastStore.getState().addToast({
        title: 'Sync Complete',
        description: `Synced ${progressList.length} reading progress entries to WebDAV.`,
        variant: 'success',
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        title: 'Sync Failed',
        description: err?.message || 'Failed to sync with WebDAV',
        variant: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Sync Status Card */}
      <SettingSection
        title="Cross-Device Cloud Sync"
        description="Synchronize reading progress, bookmarks, and highlights between your desktop and Android phone using Nextcloud, ownCloud, Koofr, InfiniCLOUD, or any WebDAV server."
      >
        <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
          <div>
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-green-500" />
              End-to-End Self-Hosted Sync
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {lastSyncTime ? `Last synced today at ${lastSyncTime}` : 'No sync performed yet'}
            </p>
          </div>
          <Button
            type="button"
            disabled={syncing}
            onClick={handleSyncNow}
            className="gap-2 cursor-pointer text-xs shrink-0"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </SettingSection>

      {/* 2. WebDAV Credentials */}
      <SettingSection
        title="WebDAV Server Credentials"
        description="Configure your self-hosted or cloud WebDAV account."
      >
        <div className="space-y-4 mt-2">
          <SettingItem
            label="WebDAV Server URL"
            description="The base WebDAV endpoint URL (e.g., https://cloud.example.com/remote.php/dav/files/user/)"
          >
            <div className="w-full sm:w-80">
              <Input
                type="url"
                value={config.url}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://cloud.example.com/remote.php/dav/files/user/"
                className="text-xs font-mono"
              />
            </div>
          </SettingItem>

          <SettingItem
            label="Username"
            description="Account username or email"
          >
            <div className="w-full sm:w-80">
              <Input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="Username"
                className="text-xs"
              />
            </div>
          </SettingItem>

          <SettingItem
            label="App Password / Token"
            description="Generated app password from your WebDAV provider security settings"
          >
            <div className="relative w-full sm:w-80">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••••••"
                className="pr-10 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </SettingItem>

          <SettingItem
            label="Remote Sync Folder"
            description="Folder on server to store sync payloads (default: /ShioriSync/)"
          >
            <div className="w-full sm:w-80">
              <Input
                type="text"
                value={config.syncFolder || '/ShioriSync/'}
                onChange={(e) => setConfig({ ...config, syncFolder: e.target.value })}
                placeholder="/ShioriSync/"
                className="text-xs font-mono"
              />
            </div>
          </SettingItem>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={handleTestConnection}
              className="text-xs cursor-pointer"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveConfig}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Save size={14} />
              Save Credentials
            </Button>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
