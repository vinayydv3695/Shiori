import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, MonitorSmartphone, Wifi } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useToast } from '@/store/toastStore';
import { SyncClient } from '@/lib/sync';

interface CompanionInstance {
  name: string;
  ip: string;
  port: number;
}

export function CompanionDiscovery() {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual' | 'qr'>('auto');
  const [discovered, setDiscovered] = useState<CompanionInstance[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8081');
  const [manualToken, setManualToken] = useState('');
  
  const [isPairing, setIsPairing] = useState(false);
  const toast = useToast();

  const scanForCompanions = async () => {
    setIsScanning(true);
    try {
      const instances = await invoke<CompanionInstance[]>('scan_for_companions');
      setDiscovered(instances);
    } catch (e) {
      console.error("Discovery failed", e);
      toast.error("Failed to scan for desktop companions.");
    } finally {
      setIsScanning(false);
    }
  };

  const connectToInstance = async (ip: string, port: number, token: string) => {
    if (!token) {
      toast.error("Pairing token is required");
      return;
    }
    
    setIsPairing(true);
    try {
      // 1. Try to pair via Tauri sync backend
      await SyncClient.syncWithDesktop(ip, port, token);
      
      // 2. If successful, save to localStorage for future auto-sync
      localStorage.setItem('sync_host_ip', ip);
      localStorage.setItem('sync_host_port', port.toString());
      localStorage.setItem('sync_host_token', token);
      
      toast.success(`Connected & Synced with ${ip}:${port}`);
    } catch (e: any) {
      console.error("Pairing failed", e);
      toast.error(typeof e === 'string' ? e : "Failed to pair with desktop.");
    } finally {
      setIsPairing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'auto') {
      scanForCompanions();
    }
  }, [activeTab]);

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

      // Step 1: explicitly request camera permission via getUserMedia
      // This triggers the Android WebView's onPermissionRequest → native permission dialog
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Got permission — stop the stream immediately so html5-qrcode can use the camera
        stream.getTracks().forEach(t => t.stop());
      } catch (err: any) {
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setQrError('Camera permission was denied. Please grant camera access in your device Settings → Apps → Shiori → Permissions.');
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

      // Step 2: Initialize the QR scanner now that we have permission
      scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scanner.render((decodedText) => {
        try {
          if (decodedText.startsWith('shiori://companion')) {
            const url = new URL(decodedText);
            const ip = url.searchParams.get('ip');
            const port = parseInt(url.searchParams.get('port') || '8081', 10);
            const token = url.searchParams.get('token');
            if (ip && token) {
              connectToInstance(ip, port, token);
              if (scanner) scanner.clear();
              setActiveTab('auto');
            }
          }
        } catch (e) {
          console.error("Invalid QR code payload", e);
        }
      }, (_error) => {
        // Ignore frame-level scan errors
      });
    };

    void initScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [activeTab]);

  return (
    <div className="w-full max-w-md mx-auto bg-background border rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b bg-muted/30">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5" /> Pair with Desktop
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your mobile app to your desktop Shiori library.
        </p>
      </div>

      <div className="flex border-b">
        <button 
          className={`flex-1 p-3 text-sm font-medium ${activeTab === 'auto' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
          onClick={() => setActiveTab('auto')}
        >
          Auto Scan
        </button>
        <button 
          className={`flex-1 p-3 text-sm font-medium ${activeTab === 'qr' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
          onClick={() => setActiveTab('qr')}
        >
          Scan QR
        </button>
        <button 
          className={`flex-1 p-3 text-sm font-medium ${activeTab === 'manual' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
          onClick={() => setActiveTab('manual')}
        >
          Manual
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'auto' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-muted-foreground">Discovered instances:</span>
              <Button size="sm" variant="outline" onClick={scanForCompanions} disabled={isScanning}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
                Rescan
              </Button>
            </div>
            
            {discovered.length === 0 ? (
              <div className="text-center p-8 bg-muted/20 rounded-lg border border-dashed">
                <Wifi className="w-8 h-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-sm text-muted-foreground">No desktop instances found on the local network.</p>
                <p className="text-xs text-muted-foreground mt-2">Make sure "Companion Discovery" is enabled in Desktop Settings.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {discovered.map((instance, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <div className="font-medium text-sm">{instance.name.replace('._shiori._tcp.local.', '')}</div>
                      <div className="text-xs text-muted-foreground font-mono">{instance.ip}:{instance.port}</div>
                      <Input 
                        placeholder="Pairing Token" 
                        className="h-8 text-xs mt-2" 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            connectToInstance(instance.ip, instance.port, (e.target as HTMLInputElement).value);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'qr' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Scan the QR code displayed in your Desktop App's Settings.
            </p>

            {qrError && (
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive space-y-3">
                <p>{qrError}</p>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setActiveTab('auto'); setTimeout(() => setActiveTab('qr'), 50); }}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry Camera
                  </Button>
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => {
                      // Open app settings on Android
                      try { invoke('plugin:android-saf|open_app_settings'); } catch { /* ignore */ }
                    }}
                  >
                    Open App Settings
                  </button>
                </div>
              </div>
            )}

            {!qrError && !cameraReady && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mb-3 opacity-50" />
                <p className="text-sm">Requesting camera permission…</p>
              </div>
            )}

            {cameraReady && (
              <div className="overflow-hidden rounded-lg border bg-black/5" id="qr-reader" style={{ width: '100%', minHeight: '250px' }}></div>
            )}
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Desktop IP Address</label>
              <Input 
                placeholder="192.168.1.x" 
                value={manualIp}
                onChange={e => setManualIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Port</label>
              <Input 
                placeholder="8081" 
                value={manualPort}
                onChange={e => setManualPort(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pairing Token</label>
              <Input 
                placeholder="Token..." 
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
              />
            </div>
            <Button 
              className="w-full mt-4" 
              onClick={() => connectToInstance(manualIp, parseInt(manualPort, 10), manualToken)}
              disabled={!manualIp || !manualPort || !manualToken || isPairing}
            >
              {isPairing ? 'Pairing...' : 'Connect'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
