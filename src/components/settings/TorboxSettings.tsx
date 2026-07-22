import { useState, useEffect, useCallback } from 'react';
import { api, isTauri } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';
import { CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export function TorboxSettings() {
  const [apiKey, setApiKey] = useState<string>('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const toast = useToast();

  const loadApiKey = useCallback(async () => {
    if (!isTauri) return;
    
    try {
      const key = await api.getTorboxKey();
      setSavedApiKey(key);
      if (key) {
        setApiKey(key);
      }
    } catch (err) {
      logger.error('Failed to load Torbox API key:', err);
    }
  }, []);

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('Torbox settings only work in Tauri environment');
      return;
    }

    try {
      setIsLoading(true);
      setTestResult(null);

      const keyToSave = apiKey.trim();
      await api.saveTorboxKey(keyToSave);
      setSavedApiKey(keyToSave || null);
      
      if (keyToSave) {
        toast.success('Torbox API key saved successfully');
      } else {
        toast.success('Torbox API key removed');
      }
    } catch (err) {
      logger.error('Failed to save Torbox API key:', err);
      toast.error('Failed to save API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!isTauri) {
      toast.warning('Torbox settings only work in Tauri environment');
      return;
    }

    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key first' });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);

      const verify = await api.verifyTorboxKey(apiKey.trim());
      setSavedApiKey(apiKey.trim());
      setTestResult({ 
        success: verify.valid,
        message: verify.message,
      });
      toast.success('API key verified and configured');
    } catch (err) {
      logger.error('Failed to test Torbox API key:', err);
      setTestResult({ 
        success: false, 
        message: err instanceof Error ? err.message : 'Failed to connect to Torbox' 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = async () => {
    if (!isTauri) return;
    
    try {
      setIsLoading(true);
      await api.saveTorboxKey('');
      setApiKey('');
      setSavedApiKey(null);
      setTestResult(null);
      toast.success('Torbox API key cleared');
    } catch (err) {
      logger.error('Failed to clear Torbox API key:', err);
      toast.error('Failed to clear API key');
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = apiKey !== (savedApiKey || '');

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <a
            href="https://torbox.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Get your API key from Torbox.app →
          </a>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              id="torbox-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter Torbox API key"
              className="font-mono text-sm pr-10"
              disabled={isLoading || isTesting}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={handleSave}
          disabled={isLoading || isTesting || !hasChanges}
          className="gap-2"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isLoading || isTesting || !apiKey.trim()}
          className="gap-2"
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
        {savedApiKey && (
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={isLoading || isTesting}
          >
            Clear
          </Button>
        )}
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-lg border flex items-start gap-2 ${
            testResult.success
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          )}
          <p
            className={`text-sm ${
              testResult.success
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}
          >
            {testResult.message}
          </p>
        </div>
      )}

      {savedApiKey && !testResult && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            API key configured for online downloads.
          </p>
        </div>
      )}
    </div>
  );
}
