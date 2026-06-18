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

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 3000;

export function useDiscordPresence() {
  const preferences = usePreferencesStore(state => state.preferences);
  const isEnabled = preferences?.discordRpcEnabled ?? true;
  const [isConnected, setIsConnected] = useState(false);
  const connectingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Connect or disconnect based on preference, with retry logic
  useEffect(() => {
    mountedRef.current = true;

    function clearRetryTimer() {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }

    async function attemptConnect() {
      if (!mountedRef.current || connectingRef.current) return;

      connectingRef.current = true;
      try {
        await invoke('discord_connect');
        if (mountedRef.current) {
          setIsConnected(true);
          retryCountRef.current = 0;
          logger.info('Connected to Discord RPC');
        }
      } catch (e: any) {
        const errorMessage = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
        if (errorMessage.includes('IPC socket') || errorMessage.includes('failed to find IPC socket')) {
          logger.debug('Discord RPC: Discord not running (no IPC socket found).');
          connectingRef.current = false;
          return;
        }

        logger.error('Failed to connect to Discord RPC:', e);
        if (mountedRef.current && retryCountRef.current < MAX_RETRY_ATTEMPTS) {
          retryCountRef.current += 1;
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
          logger.info(`Discord RPC: retrying connection in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS})`);
          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              attemptConnect();
            }
          }, delay);
        } else if (mountedRef.current) {
          logger.warn(`Discord RPC: giving up after ${MAX_RETRY_ATTEMPTS} attempts`);
        }
      } finally {
        connectingRef.current = false;
      }
    }

    async function toggleConnection() {
      if (!isEnabled) {
        clearRetryTimer();
        retryCountRef.current = 0;
        if (isConnected) {
          try {
            await invoke('discord_disconnect');
            if (mountedRef.current) {
              setIsConnected(false);
              logger.info('Disconnected from Discord RPC');
            }
          } catch (e) {
            logger.error('Failed to disconnect from Discord RPC:', e);
          }
        }
        return;
      }

      if (!isConnected) {
        attemptConnect();
      }
    }

    toggleConnection();

    return () => {
      mountedRef.current = false;
      clearRetryTimer();
    };
  }, [isEnabled, isConnected]);

  const setActivity = useCallback(async (activity: ActivityProps) => {
    if (!isEnabled || !isConnected) return;
    try {
      await invoke('discord_set_activity', { presence: activity });
    } catch (e) {
      logger.error('Failed to set Discord activity:', e);
      // If setting activity fails, the connection may be stale — reset so we reconnect
      setIsConnected(false);
    }
  }, [isEnabled, isConnected]);

  const clearActivity = useCallback(async () => {
    if (!isEnabled || !isConnected) return;
    try {
      await invoke('discord_clear_activity');
    } catch (e) {
      logger.error('Failed to clear Discord activity:', e);
      setIsConnected(false);
    }
  }, [isEnabled, isConnected]);

  return { setActivity, clearActivity, isConnected };
}
