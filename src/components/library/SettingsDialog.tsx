import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * @deprecated Use src/components/settings/SettingsDialog.tsx instead.
 * This legacy dialog is kept temporarily for compatibility.
 */
export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState({
    theme: theme as string,
    defaultView: 'grid' as 'grid' | 'list' | 'table',
    booksPerPage: '50',
    autoExtractMetadata: true,
    autoExtractCovers: true,
    checkDuplicates: true,
  });

  useEffect(() => {
    if (open) {
      setSettings({
        theme: theme,
        defaultView: 'grid',
        booksPerPage: '50',
        autoExtractMetadata: true,
        autoExtractCovers: true,
        checkDuplicates: true,
      });
    }
  }, [open, theme]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Apply theme via the canonical system
      setTheme(settings.theme === 'black' ? 'black' : 'white');
      
      localStorage.setItem('shiori_settings', JSON.stringify(settings));
      
      toast.success('Settings saved', 'Your preferences have been updated');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save', 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
            <div className="space-y-6">
              {/* Appearance Section */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Appearance</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Theme
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant={settings.theme === 'light' ? 'default' : 'outline'}
                        onClick={() => setSettings(prev => ({ ...prev, theme: 'light' }))}
                        className="flex-1"
                      >
                        Light
                      </Button>
                      <Button
                        variant={settings.theme === 'dark' ? 'default' : 'outline'}
                        onClick={() => setSettings(prev => ({ ...prev, theme: 'dark' }))}
                        className="flex-1"
                      >
                        Dark
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Default View
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant={settings.defaultView === 'grid' ? 'default' : 'outline'}
                        onClick={() => setSettings(prev => ({ ...prev, defaultView: 'grid' }))}
                        className="flex-1"
                      >
                        Grid
                      </Button>
                      <Button
                        variant={settings.defaultView === 'list' ? 'default' : 'outline'}
                        onClick={() => setSettings(prev => ({ ...prev, defaultView: 'list' }))}
                        className="flex-1"
                      >
                        List
                      </Button>
                      <Button
                        variant={settings.defaultView === 'table' ? 'default' : 'outline'}
                        onClick={() => setSettings(prev => ({ ...prev, defaultView: 'table' }))}
                        className="flex-1"
                      >
                        Table
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Books Per Page
                    </label>
                    <Input
                      type="number"
                      min="10"
                      max="500"
                      step="10"
                      value={settings.booksPerPage}
                      onChange={(e) => setSettings(prev => ({ ...prev, booksPerPage: e.target.value }))}
                      className="w-32"
                    />
                  </div>
                </div>
              </div>

              {/* Library Section */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Library</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoExtractMetadata}
                      onChange={(e) => setSettings(prev => ({ ...prev, autoExtractMetadata: e.target.checked }))}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="text-sm text-foreground">
                      Automatically extract metadata from imported books
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoExtractCovers}
                      onChange={(e) => setSettings(prev => ({ ...prev, autoExtractCovers: e.target.checked }))}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="text-sm text-foreground">
                      Automatically extract cover images from books
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.checkDuplicates}
                      onChange={(e) => setSettings(prev => ({ ...prev, checkDuplicates: e.target.checked }))}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="text-sm text-foreground">
                      Check for duplicate books on import
                    </span>
                  </label>
                </div>
              </div>

              {/* About Section */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">About</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Shiori</span> - A beautiful, fast, and offline-first eBook library manager
                  </p>
                  <p>Version: 0.1.0 (Phase 1A)</p>
                  <p>Built with Tauri, Rust, React, and TypeScript</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={saving}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="min-w-24"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
