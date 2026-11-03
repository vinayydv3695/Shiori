import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  RefreshCw,
  Wifi,
  Laptop,
  Smartphone,
  CheckCircle2,
  Zap,
  Clock,
  ArrowUpDown,
  QrCode,
  Flame,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { usePeerSyncStore } from '@/store/peerSyncStore';
import { CompanionInstance } from '@/lib/sync';
import { useToast } from '@/store/toastStore';

export function CompanionDiscovery() {
  const [activeTab, setActiveTab] = useState<'radar' | 'qr' | 'manual'>('radar');
  const [pairingDevice, setPairingDevice] = useState<CompanionInstance | null>(null);
  const [pairingTokenInput, setPairingTokenInput] = useState('');

  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8081');
  const [manualToken, setManualToken] = useState('');

  const toast = useToast();

  const {
    discoveredDevices,
    isScanning,
    isSyncing,
    savedHost,
    lastSyncedAt,
    lastSyncSummary,
    autoSyncEnabled,
    scanDevices,
    syncWithDevice,
    syncWithSavedHost,
    setAutoSyncEnabled,
  } = usePeerSyncStore();

  useEffect(() => {
    void scanDevices();
  }, [scanDevices]);

  // QR Scanner logic
  const [qrError, setQrError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let cancelled = false;

    if (activeTab !== 'qr') {
      setQrError(null);
      setCameraReady(false);
      return;
    }

    const initScanner = async () => {
      setQrError(null);
      setCameraReady(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err: any) {
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setQrError('Camera permission was denied. Grant camera access in your device Settings.');
          } else if (err.name === 'NotFoundError') {
            setQrError('No camera found on this device.');
          } else {
            setQrError(`Camera error: ${err.message || err}`);
          }
        }
        return;
      }

      if (cancelled) return;
      setCameraReady(true);

      scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          try {
            if (decodedText.startsWith('shiori://companion')) {
              const url = new URL(decodedText);
              const ip = url.searchParams.get('ip');
              const port = parseInt(url.searchParams.get('port') || '8081', 10);
              const token = url.searchParams.get('token');
              if (ip && token) {
                if (scanner) void scanner.clear();
                setActiveTab('radar');
                void syncWithDevice(ip, port, token);
              }
            }
          } catch (e) {
            console.error('Invalid QR code payload', e);
          }
        },
        () => {}
      );
    };

    void initScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [activeTab, syncWithDevice]);

  const handleManualConnect = async () => {
    if (!manualIp || !manualToken) {
      toast.error('IP address and pairing token are required.');
      return;
    }
    const port = parseInt(manualPort, 10) || 8081;
    try {
      await syncWithDevice(manualIp, port, manualToken);
      setActiveTab('radar');
    } catch {
      // Error handled by store
    }
  };

  const handleDeviceCardSync = async (device: CompanionInstance) => {
    // If device matches savedHost, we already have the token
    if (savedHost && savedHost.ip === device.ip) {
      await syncWithDevice(device.ip, device.port, savedHost.token, device.name);
      return;
    }

    // Prompt for pairing token
    setPairingDevice(device);
    setPairingTokenInput('');
  };

  const submitPairing = async () => {
    if (!pairingDevice || !pairingTokenInput.trim()) return;
    try {
      await syncWithDevice(
        pairingDevice.ip,
        pairingDevice.port,
        pairingTokenInput.trim(),
        pairingDevice.name
      );
      setPairingDevice(null);
      setPairingTokenInput('');
    } catch {
      // Handled in store
    }
  };

  const formatRelativeTime = (isoString?: string | null) => {
    if (!isoString) return 'Never';
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 minute ago';
      if (diffMins < 60) return `${diffMins} mins ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;
      return date.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  const getDeviceIcon = (os?: string) => {
    const lower = (os || '').toLowerCase();
    if (lower.includes('android') || lower.includes('ios')) {
      return <Smartphone className="w-5 h-5 text-primary" />;
    }
    return <Laptop className="w-5 h-5 text-primary" />;
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-card border rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Local P2P Sync</h2>
              <p className="text-xs text-muted-foreground">LocalSend-style zero-config Wi-Fi sync</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => void scanDevices()}
            disabled={isScanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan'}
          </Button>
        </div>

        {/* Saved Paired Host Quick-Sync Card */}
        {savedHost && (
          <div className="bg-muted/40 border border-primary/20 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {savedHost.name || 'Companion Desktop'}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {savedHost.ip}:{savedHost.port}
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                className="h-8 gap-1.5 font-medium shadow-sm"
                onClick={() => void syncWithSavedHost()}
                disabled={isSyncing}
              >
                <ArrowUpDown className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Last synced: {formatRelativeTime(lastSyncedAt)}
              </span>
              {lastSyncSummary && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {lastSyncSummary.received_books} books / {lastSyncSummary.received_sessions} sessions
                </span>
              )}
            </div>
          </div>
        )}

        {/* Auto-Sync Toggle */}
        <div className="flex items-center justify-between py-1 px-1">
          <div className="space-y-0.5">
            <label className="text-xs font-medium cursor-pointer" htmlFor="auto-sync-toggle">
              Auto-Sync on App Open & Resume
            </label>
            <p className="text-[11px] text-muted-foreground">
              Instant resume: sync reading progress and streaks when on the same Wi-Fi
            </p>
          </div>
          <Switch
            id="auto-sync-toggle"
            checked={autoSyncEnabled}
            onChange={(checked) => setAutoSyncEnabled(checked)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-muted/40 p-1 rounded-xl border text-xs font-medium">
        <button
          className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'radar' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
          }`}
          onClick={() => setActiveTab('radar')}
        >
          <Wifi className="w-3.5 h-3.5" /> Nearby Devices
        </button>
        <button
          className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'qr' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
          }`}
          onClick={() => setActiveTab('qr')}
        >
          <QrCode className="w-3.5 h-3.5" /> Scan QR
        </button>
        <button
          className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'manual' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Manual IP
        </button>
      </div>

      {/* Tab: Radar / Discovered Devices */}
      {activeTab === 'radar' && (
        <div className="space-y-3">
          {discoveredDevices.length === 0 ? (
            <div className="text-center p-8 bg-card border rounded-2xl border-dashed space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Wifi className={`w-6 h-6 ${isScanning ? 'animate-pulse text-primary' : 'opacity-40'}`} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {isScanning ? 'Searching for Shiori devices on your Wi-Fi...' : 'No companion devices detected'}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Ensure Shiori is running on your desktop on the same Wi-Fi network.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void scanDevices()}
                disabled={isScanning}
                className="mt-2 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isScanning ? 'animate-spin' : ''}`} />
                Scan Again
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground px-1">
                Found {discoveredDevices.length} companion device{discoveredDevices.length > 1 ? 's' : ''} on Wi-Fi:
              </span>

              {discoveredDevices.map((device, idx) => {
                const isPaired = savedHost?.ip === device.ip;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 bg-card border rounded-xl hover:border-primary/40 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-muted flex items-center justify-center">
                        {getDeviceIcon(device.os)}
                      </div>
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {device.name}
                          {isPaired && (
                            <span className="text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-md">
                              Paired
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {device.ip}:{device.port}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isPaired ? 'default' : 'outline'}
                      className="h-8 gap-1.5 text-xs font-medium"
                      onClick={() => void handleDeviceCardSync(device)}
                      disabled={isSyncing}
                    >
                      <ArrowUpDown className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isPaired ? 'Sync' : 'Pair & Sync'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Pairing Dialog */}
          {pairingDevice && (
            <div className="p-4 bg-card border border-primary/40 rounded-xl space-y-3 shadow-sm animate-in fade-in-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Pair with {pairingDevice.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-xs"
                  onClick={() => setPairingDevice(null)}
                >
                  ✕
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the Pairing Token displayed in your desktop Settings → Companion tab:
              </p>
              <Input
                placeholder="Pairing token (32 characters)..."
                value={pairingTokenInput}
                onChange={(e) => setPairingTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitPairing();
                }}
                className="font-mono text-xs"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setPairingDevice(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submitPairing()}
                  disabled={!pairingTokenInput.trim() || isSyncing}
                >
                  {isSyncing ? 'Connecting...' : 'Pair & Sync Now'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: QR Scanner */}
      {activeTab === 'qr' && (
        <div className="bg-card border rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <p className="text-xs text-muted-foreground">
            Point your camera at the QR code in desktop Settings → Mobile Companion.
          </p>

          {qrError && (
            <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive space-y-2">
              <p>{qrError}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setActiveTab('radar');
                  setTimeout(() => setActiveTab('qr'), 50);
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Retry Camera
              </Button>
            </div>
          )}

          {!qrError && !cameraReady && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mb-2 opacity-50" />
              <p className="text-xs">Requesting camera access...</p>
            </div>
          )}

          {cameraReady && (
            <div
              className="overflow-hidden rounded-xl border border-border/50 bg-muted/20 mx-auto"
              id="qr-reader"
              style={{ width: '100%', minHeight: '250px' }}
            />
          )}
        </div>
      )}

      {/* Tab: Manual Setup */}
      {activeTab === 'manual' && (
        <div className="bg-card border rounded-2xl p-4 space-y-3.5 shadow-sm">
          <div className="space-y-1">
            <label className="text-xs font-medium">Desktop IP Address</label>
            <Input
              placeholder="e.g. 192.168.1.100"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Port</label>
            <Input
              placeholder="8081"
              value={manualPort}
              onChange={(e) => setManualPort(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Pairing Token</label>
            <Input
              placeholder="Paste token from Desktop Settings"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <Button
            className="w-full h-9 text-xs font-medium mt-2 gap-1.5"
            onClick={() => void handleManualConnect()}
            disabled={!manualIp || !manualToken || isSyncing}
          >
            <Zap className="w-3.5 h-3.5" />
            {isSyncing ? 'Connecting & Syncing...' : 'Connect & Sync'}
          </Button>
        </div>
      )}

      {/* Sync Capabilities Feature Pills */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground px-1">
        <div className="flex items-center gap-1.5 p-2 bg-muted/20 border rounded-lg">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
          <span>Page & CFI location sync</span>
        </div>
        <div className="flex items-center gap-1.5 p-2 bg-muted/20 border rounded-lg">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Reading streaks & sessions</span>
        </div>
      </div>
    </div>
  );
}
