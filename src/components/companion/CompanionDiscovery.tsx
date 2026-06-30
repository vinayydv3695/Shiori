import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, QrCode, MonitorSmartphone, Wifi } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useToast } from '@/store/toastStore';

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
  const [manualPort, setManualPort] = useState('8080');
  
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

  const connectToInstance = (ip: string, port: number) => {
    // In a real app, you would save this to settings, initialize a websocket, or test the API
    console.log(`Connecting to ${ip}:${port}`);
    toast.success(`Connected to ${ip}:${port}`);
    // Save to preferences/store
  };

  useEffect(() => {
    if (activeTab === 'auto') {
      scanForCompanions();
    }
  }, [activeTab]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (activeTab === 'qr') {
      scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scanner.render((decodedText) => {
        // Expected format: shiori://companion?ip=192.168.1.100&port=8080
        try {
          if (decodedText.startsWith('shiori://companion')) {
            const url = new URL(decodedText);
            const ip = url.searchParams.get('ip');
            const port = parseInt(url.searchParams.get('port') || '8080', 10);
            if (ip) {
              connectToInstance(ip, port);
              if (scanner) scanner.clear();
              setActiveTab('auto'); // switch back
            }
          }
        } catch (e) {
          console.error("Invalid QR code payload", e);
        }
      }, (error) => {
        // Ignore errors from missing frames
      });
    }

    return () => {
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
                    </div>
                    <Button size="sm" onClick={() => connectToInstance(instance.ip, instance.port)}>
                      Connect
                    </Button>
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
            <div className="overflow-hidden rounded-lg border bg-black/5" id="qr-reader" style={{ width: '100%', minHeight: '250px' }}></div>
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
                placeholder="8080" 
                value={manualPort}
                onChange={e => setManualPort(e.target.value)}
              />
            </div>
            <Button 
              className="w-full mt-4" 
              onClick={() => connectToInstance(manualIp, parseInt(manualPort, 10))}
              disabled={!manualIp || !manualPort}
            >
              Connect
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
