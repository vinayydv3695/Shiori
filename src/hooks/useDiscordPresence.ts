import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePreferencesStore } from '../store/preferencesStore';
import { logger } from '../lib/logger';

interface ActivityProps {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
}

export function useDiscordPresence() {
  const preferences = usePreferencesStore(state => state.preferences);
  const isEnabled = preferences?.discordRpcEnabled ?? true;
  const [isConnected, setIsConnected] = useState(false);
  const connectingRef = useRef(false);

  // Connect or disconnect based on preference
  useEffect(() => {
    let mounted = true;

    async function toggleConnection() {
      if (!isEnabled) {
        if (isConnected) {
          try {
            await invoke('discord_disconnect');
            setIsConnected(false);
            logger.info('Disconnected from Discord RPC');
          } catch (e) {
            logger.error('Failed to disconnect from Discord RPC:', e);
          }
        }
        return;
      }

      if (!isConnected && !connectingRef.current) {
        connectingRef.current = true;
        try {
          await invoke('discord_connect');
          setIsConnected(true);
          logger.info('Connected to Discord RPC');
        } catch (e) {
          logger.error('Failed to connect to Discord RPC:', e);
        } finally {
          connectingRef.current = false;
        }
      }
    }

    toggleConnection();

    return () => {
      mounted = false;
      // We don't automatically disconnect on unmount because this hook
      // should be mounted globally in App.tsx
    };
  }, [isEnabled]);

  const setActivity = useCallback(async (activity: ActivityProps) => {
    if (!isEnabled || !isConnected) return;
    try {
      await invoke('discord_set_activity', { presence: activity });
    } catch (e) {
      logger.error('Failed to set Discord activity:', e);
    }
  }, [isEnabled, isConnected]);

  const clearActivity = useCallback(async () => {
    if (!isEnabled || !isConnected) return;
    try {
      await invoke('discord_clear_activity');
    } catch (e) {
      logger.error('Failed to clear Discord activity:', e);
    }
  }, [isEnabled, isConnected]);

  return { setActivity, clearActivity, isConnected };
}
