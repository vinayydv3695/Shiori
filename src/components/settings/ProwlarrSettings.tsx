import { useState, useEffect, useCallback } from 'react'
import { api, isTauri } from '@/lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/store/toastStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { logger } from '@/lib/logger'
import { CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

const DEFAULT_CATEGORIES = '7000,8000'

export function ProwlarrSettings() {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateGeneralSettings = usePreferencesStore((s) => s.updateGeneralSettings)

  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const toast = useToast()

  // Load from preferences store once it hydrates
  const loadFromPrefs = useCallback(() => {
    if (!preferences) return
    const prefs = preferences as unknown as {
      prowlarrEnabled?: boolean
      prowlarrUrl?: string
      prowlarrApiKey?: string
      prowlarrCategories?: string
    }
    setEnabled(prefs.prowlarrEnabled ?? false)
    setUrl(prefs.prowlarrUrl ?? '')
    setApiKey(prefs.prowlarrApiKey ?? '')
    // Convert JSON array string to comma-separated for display
    const raw = prefs.prowlarrCategories ?? '[7000,8000]'
    try {
      const parsed = JSON.parse(raw)
      setCategories(Array.isArray(parsed) ? parsed.join(', ') : raw)
    } catch {
      setCategories(raw)
    }
    setLoaded(true)
  }, [preferences])

  useEffect(() => {
    loadFromPrefs()
  }, [loadFromPrefs])

  const handleSave = async () => {
    if (!isTauri) {
      toast.warning('Prowlarr settings only work in the Tauri environment')
      return
    }
    try {
      setIsSaving(true)
      setTestResult(null)

      // Convert comma-separated categories to JSON array string
      const catArray = categories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n))
      const catJson = JSON.stringify(catArray)

      await updateGeneralSettings({
        prowlarrEnabled: enabled,
        prowlarrUrl: url.trim(),
        prowlarrApiKey: apiKey.trim(),
        prowlarrCategories: catJson,
      } as Parameters<typeof updateGeneralSettings>[0])

      toast.success('Prowlarr settings saved')
    } catch (err) {
      logger.error('Failed to save Prowlarr settings:', err)
      toast.error('Failed to save Prowlarr settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    if (!isTauri) {
      toast.warning('Prowlarr settings only work in the Tauri environment')
      return
    }
    if (!url.trim()) {
      setTestResult({ success: false, message: 'Please enter the Prowlarr URL first' })
      return
    }
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter the Prowlarr API key first' })
      return
    }
    try {
      setIsTesting(true)
      setTestResult(null)
      await api.prowlarrTestConnection(url.trim(), apiKey.trim())
      setTestResult({ success: true, message: 'Connected to Prowlarr successfully!' })
    } catch (err) {
      logger.error('Prowlarr connection test failed:', err)
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Prowlarr',
      })
    } finally {
      setIsTesting(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prowlarr is a local torrent indexer proxy. Configure its URL and API key to search for
        book releases directly from Shiori.
      </p>

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <input
          id="prowlarr-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 accent-primary"
          aria-label="Enable Prowlarr integration"
        />
        <label htmlFor="prowlarr-enabled" className="text-sm font-medium cursor-pointer">
          Enable Prowlarr integration
        </label>
      </div>

      {enabled && (
        <div className="space-y-3 pl-7">
          {/* URL */}
          <div>
            <label htmlFor="prowlarr-url" className="text-sm font-medium mb-1.5 block">
              Prowlarr URL
            </label>
            <Input
              id="prowlarr-url"
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setTestResult(null) }}
              placeholder="http://localhost:9696"
              className="font-mono text-sm"
              disabled={isSaving || isTesting}
            />
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="prowlarr-api-key" className="text-sm font-medium mb-1.5 block">
              API Key
            </label>
            <div className="relative">
              <Input
                id="prowlarr-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }}
                placeholder="Your Prowlarr API key"
                className="font-mono text-sm pr-10"
                disabled={isSaving || isTesting}
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
            <p className="text-xs text-muted-foreground mt-1">
              Found under Prowlarr → Settings → General → API Key
            </p>
          </div>

          {/* Categories */}
          <div>
            <label htmlFor="prowlarr-categories" className="text-sm font-medium mb-1.5 block">
              Search Categories
            </label>
            <Input
              id="prowlarr-categories"
              type="text"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="7000, 8000"
              className="font-mono text-sm"
              disabled={isSaving || isTesting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated Newznab category IDs. 7000 = eBooks, 8000 = Audiobooks.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="default"
              onClick={handleSave}
              disabled={isSaving || isTesting}
              className="gap-2"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isSaving || isTesting || !url.trim() || !apiKey.trim()}
              className="gap-2"
            >
              {isTesting ? <Loader2 size={14} className="animate-spin" /> : null}
              {isTesting ? 'Testing…' : 'Test Connection'}
            </Button>
          </div>

          {/* Test result */}
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
        </div>
      )}
    </div>
  )
}
