import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, ShieldX } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { api } from '@/lib/tauri';

type TorboxIntegrationStepProps = {
  onBack: () => void;
  onNext: () => void;
};

export function TorboxIntegrationStep({ onBack, onNext }: TorboxIntegrationStepProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testValid, setTestValid] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadStoredKey = async () => {
      try {
        const savedKey = await api.getTorboxKey();
        if (isMounted && savedKey) {
          setApiKey(savedKey);
        }
      } catch {
        if (isMounted) {
          setMessage('Could not load saved Torbox key. You can still add it now.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadStoredKey();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasKey = useMemo(() => apiKey.trim().length > 0, [apiKey]);

  const handleSave = async () => {
    if (!hasKey || isSaving) return;
    setIsSaving(true);
    setMessage(null);

    try {
      await api.saveTorboxKey(apiKey.trim());
      setMessage('Torbox API key saved.');
    } catch {
      setMessage('Failed to save Torbox API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!hasKey || isTesting) return;
    setIsTesting(true);
    setMessage(null);
    setTestValid(null);

    try {
      const result = await api.verifyTorboxKey(apiKey.trim());
      setTestValid(result.valid);
      setMessage(result.message || (result.valid ? 'Torbox key verified.' : 'Torbox key is invalid.'));
    } catch {
      setTestValid(false);
      setMessage('Failed to verify key. You can continue and configure this later.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="onb-fade-up flex items-center gap-3 shrink-0">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-200">
            <KeyRound className="h-5 w-5 onb-icon-inner" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Torbox Integration</h2>
        </div>

        <p className="onb-fade-up onb-delay-100 mt-3 max-w-3xl shrink-0 text-sm text-white/65 md:text-base">
          Connect Torbox to unlock debrid-assisted downloads in Shiori. You can skip this now and set it up later.
        </p>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="onb-fade-up onb-delay-200 mt-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
              <label htmlFor="torbox-api-key" className="text-sm font-semibold text-white">
                Torbox API Key
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="torbox-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setMessage(null);
                    setTestValid(null);
                  }}
                  placeholder="tbx_..."
                  className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                  autoComplete="off"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-white transition hover:bg-white/5"
                  onClick={() => setShowKey((prev) => !prev)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  disabled={isLoading}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <GlowButton
                  theme="dark"
                  variant="secondary"
                  onClick={() => void handleSave()}
                  disabled={!hasKey || isLoading || isSaving}
                  className="border-white/10 bg-slate-900 text-white hover:bg-white/5"
                >
                  {isSaving ? 'Saving...' : 'Save key'}
                </GlowButton>

                <GlowButton
                  theme="dark"
                  variant="secondary"
                  onClick={() => void handleTest()}
                  disabled={!hasKey || isLoading || isTesting}
                  className="border-white/10 bg-slate-900 text-white hover:bg-white/5"
                >
                  {isTesting ? 'Testing...' : 'Test key'}
                </GlowButton>

                <button
                  type="button"
                  onClick={onNext}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/5 hover:text-white"
                >
                  Skip for now
                </button>
              </div>

              {message ? (
                <div
                  className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                    testValid === null
                      ? 'border-white/10 bg-slate-900/70 text-white/65'
                      : testValid
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {testValid === null ? null : testValid ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
                  <span>{message}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-4 flex shrink-0 items-center justify-between border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">
          <GlowButton theme="dark" variant="secondary" onClick={onBack} className="px-6">
            ← Back
          </GlowButton>
          <GlowButton theme="dark" variant="primary" onClick={onNext} className="onb-cta-glow px-8">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default TorboxIntegrationStep;
