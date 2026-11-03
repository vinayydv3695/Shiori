import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  QrCode,
  Wifi,
  MonitorSmartphone,
  Server,
  KeyRound,
  Copy,
  RotateCcw,
  RefreshCw,
  ArrowUpDown,
  Smartphone,
  Laptop,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncClient, CompanionInstance } from '@/lib/sync';
import { usePeerSyncStore } from '@/store/peerSyncStore';
import { useToast } from '@/store/toastStore';
import { AppTooltip } from '@/components/ui/tooltip';

interface LocalIp {
  ip: string;
}

export function DesktopCompanionSettings() {
  const [isBroadcasting, setIsBroadcasting] = useState(true);
  const [localIps, setLocalIps] = useState<LocalIp[]>([]);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [port] = useState(8081);
  const [token, setToken] = useState<string | null>(null);

  const toast = useToast();

  const {
    discoveredDevices,
    isScanning,
    isSyncing,
    lastSyncedAt,
    lastSyncSummary,
    scanDevices,
    syncWithDevice,
  } = usePeerSyncStore();

  const fetchIpsAndToken = async () => {
    try {
      const running = await SyncClient.getServerStatus().catch(() => false);
      setIsBroadcasting(running);

      const t = await SyncClient.getPairingToken();
      setToken(t);

      const ips = await invoke<LocalIp[]>('get_local_ips');
      setLocalIps(ips);
      if (ips.length > 0) {
        const svg = await invoke<string>('generate_pairing_qr', { ip: ips[0].ip, port, token: t });
        setQrCodeSvg(svg);
      }
    } catch (e) {
      console.error('Failed to init companion settings', e);
    }
  };

  useEffect(() => {
    void fetchIpsAndToken();
    void scanDevices();
  }, [port, scanDevices]);

  const rotateToken = async () => {
    try {
      const newT = await SyncClient.rotatePairingToken();
      setToken(newT);
      if (localIps.length > 0) {
        const svg = await invoke<string>('generate_pairing_qr', { ip: localIps[0].ip, port, token: newT });
        setQrCodeSvg(svg);
      }
      toast.success('Pairing token rotated.');
    } catch {
      toast.error('Failed to rotate token');
    }
  };

  const toggleBroadcast = async () => {
    try {
      if (isBroadcasting) {
        await invoke('stop_companion_broadcast');
        await SyncClient.stopServer();
        setIsBroadcasting(false);
        toast.info('Sync server and broadcast stopped.');
      } else {
        await SyncClient.startServer();
        await invoke('start_companion_broadcast', { port });
        setIsBroadcasting(true);
        toast.success('Sync server active and broadcasting on local network.');
      }
    } catch (e) {
      console.error('Failed to toggle broadcast', e);
      toast.error('Failed to toggle Sync Server.');
    }
  };

  const handleDeviceSync = async (device: CompanionInstance) => {
    if (!token) return;
    try {
      await syncWithDevice(device.ip, device.port, token, device.name);
    } catch {
      // Handled in store
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-primary" /> Local P2P Sync (LocalSend-style)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Zero-config peer-to-peer sync: sync reading progress, bookmarks, and streaks with your phone or laptop over local Wi-Fi.
        </p>
      </div>

      <div className="space-y-6">
        {/* Status Card */}
        <div className="bg-card border rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isBroadcasting
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted-foreground/10 text-muted-foreground'
              }`}
            >
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>P2P Sync Server</span>
                {isBroadcasting ? (
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Broadcasting on Wi-Fi (Port {port})
                  </span>
                ) : (
                  <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    Stopped
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isBroadcasting
                  ? 'Companion devices on the same Wi-Fi detect this desktop automatically.'
                  : 'Start broadcast so phones on your Wi-Fi can discover this machine.'}
              </p>
            </div>
          </div>
          <Button
            variant={isBroadcasting ? 'outline' : 'default'}
            size="sm"
            onClick={toggleBroadcast}
            className="text-xs h-8"
          >
            {isBroadcasting ? 'Stop Broadcast' : 'Start Broadcast'}
          </Button>
        </div>

        {/* 2-Column: QR Code & Connection Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* QR Code */}
          <div className="flex flex-col items-center justify-center border rounded-2xl p-6 bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" /> Scan with Mobile Companion
            </h3>
            {qrCodeSvg ? (
              <div
                className="bg-white p-3 rounded-2xl shadow-sm border border-border/50 [&>svg]:w-44 [&>svg]:h-44"
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              />
            ) : (
              <div className="w-48 h-48 bg-muted animate-pulse rounded-2xl flex items-center justify-center">
                <span className="text-muted-foreground text-xs">Loading QR...</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center max-w-[240px]">
              Open Shiori on your Android phone → Settings → Mobile Companion → Scan QR for 1-tap instant setup.
            </p>
          </div>

          {/* Details & Token */}
          <div className="space-y-4">
            <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wifi className="w-4 h-4 text-primary" /> Local Network Info
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Local Port</span>
                  <span className="font-mono font-medium">{port}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Available Wi-Fi IP Addresses</span>
                  <div className="flex flex-wrap gap-1.5">
                    {localIps.map((ip, idx) => (
                      <span
                        key={idx}
                        className="font-mono bg-muted/60 px-2 py-0.5 rounded text-[11px] border border-border/40"
                      >
                        {ip.ip}
                      </span>
                    ))}
                    {localIps.length === 0 && (
                      <span className="text-xs text-muted-foreground">Scanning network interfaces...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" /> Pairing Token
                </h3>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      if (token) {
                        void navigator.clipboard.writeText(token);
                        toast.success('Token copied to clipboard');
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <AppTooltip content="Rotate Token">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => void rotateToken()}
                      aria-label="Rotate Token"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </AppTooltip>
                </div>
              </div>
              <div className="bg-muted/40 border rounded-lg p-2 font-mono text-[11px] break-all select-all">
                {token || 'Loading token...'}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Required for pairing. Automatically shared when scanning the QR code above.
              </p>
            </div>
          </div>
        </div>

        {/* Nearby Companion Devices Radar */}
        <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Discovered Nearby Devices</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => void scanDevices()}
              disabled={isScanning}
            >
              <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Scan Devices'}
            </Button>
          </div>

          {discoveredDevices.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              {isScanning ? 'Scanning Wi-Fi network...' : 'No other companion instances detected nearby.'}
            </div>
          ) : (
            <div className="space-y-2">
              {discoveredDevices.map((device, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border rounded-xl bg-background/50 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    {device.os?.toLowerCase().includes('android') ? (
                      <Smartphone className="w-4 h-4 text-primary" />
                    ) : (
                      <Laptop className="w-4 h-4 text-primary" />
                    )}
                    <div>
                      <div className="font-medium text-sm">{device.name}</div>
                      <div className="text-muted-foreground font-mono">{device.ip}:{device.port}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => void handleDeviceSync(device)}
                    disabled={isSyncing}
                  >
                    <ArrowUpDown className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Now
                  </Button>
                </div>
              ))}
            </div>
          )}

          {lastSyncSummary && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 pt-2 border-t">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                Last sync: {lastSyncSummary.received_books} books, {lastSyncSummary.received_sessions} sessions with {lastSyncSummary.host_device_name} ({lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : ''})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
