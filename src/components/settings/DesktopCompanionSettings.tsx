import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QrCode, Wifi, MonitorSmartphone, Server, KeyRound, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncClient } from '@/lib/sync';
import { useToast } from '@/store/toastStore';

interface LocalIp {
  ip: string;
}

export function DesktopCompanionSettings() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [localIps, setLocalIps] = useState<LocalIp[]>([]);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [port, setPort] = useState(8081); // Changed to 8081 for sync service
  const [token, setToken] = useState<string | null>(null);
  
  const toast = useToast();
  
  const fetchIpsAndToken = async () => {
    try {
      const t = await SyncClient.getPairingToken();
      setToken(t);

      const ips = await invoke<LocalIp[]>('get_local_ips');
      setLocalIps(ips);
      if (ips.length > 0) {
        // Generate QR for the first IP by default
        const svg = await invoke<string>('generate_pairing_qr', { ip: ips[0].ip, port, token: t });
        setQrCodeSvg(svg);
      }
    } catch (e) {
      console.error("Failed to init", e);
    }
  };

  useEffect(() => {
    fetchIpsAndToken();
  }, [port]);

  const rotateToken = async () => {
    try {
      const newT = await SyncClient.rotatePairingToken();
      setToken(newT);
      if (localIps.length > 0) {
        const svg = await invoke<string>('generate_pairing_qr', { ip: localIps[0].ip, port, token: newT });
        setQrCodeSvg(svg);
      }
      toast.success("Pairing token rotated.");
    } catch (e) {
      toast.error("Failed to rotate token");
    }
  };

  const toggleBroadcast = async () => {
    try {
      if (isBroadcasting) {
        await invoke('stop_companion_broadcast');
        await SyncClient.stopServer();
        setIsBroadcasting(false);
      } else {
        await SyncClient.startServer();
        await invoke('start_companion_broadcast', { port });
        setIsBroadcasting(true);
      }
    } catch (e) {
      console.error("Failed to toggle broadcast", e);
      toast.error("Failed to toggle Sync Server.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5" /> Mobile Companion
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pair this desktop instance with the Shiori mobile app to sync your library.
        </p>
      </div>

      <div className="space-y-6">
        
        <div className="bg-muted/50 p-4 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isBroadcasting ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Companion Discovery (mDNS)</h3>
              <p className="text-xs text-muted-foreground">
                {isBroadcasting ? 'Broadcasting on local network...' : 'Not broadcasting'}
              </p>
            </div>
          </div>
          <Button 
            variant={isBroadcasting ? "destructive" : "default"} 
            onClick={toggleBroadcast}
          >
            {isBroadcasting ? 'Stop Broadcast' : 'Start Broadcast'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Wifi className="w-4 h-4" /> Local Network Details
              </h3>
              <div className="bg-background border rounded-md p-3 space-y-2 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Port</span>
                  <span className="font-mono">{port}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Available IP Addresses</span>
                  {localIps.map((ip, idx) => (
                    <div key={idx} className="font-mono bg-muted px-2 py-1 rounded text-xs inline-block mr-2 mb-2">
                      {ip.ip}
                    </div>
                  ))}
                  {localIps.length === 0 && (
                    <span className="text-xs text-muted-foreground">No IPs found</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4" /> Pairing Token
              </h3>
              <div className="bg-background border rounded-md p-3 text-sm flex items-center justify-between">
                <span className="font-mono text-xs overflow-hidden text-ellipsis mr-2">
                  {token || 'Loading...'}
                </span>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7" 
                    onClick={() => {
                      if (token) {
                        navigator.clipboard.writeText(token);
                        toast.success("Token copied to clipboard");
                      }
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7"
                    onClick={rotateToken}
                    title="Rotate Token"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Keep this token private. It grants full access to sync your library.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center border rounded-lg p-6 bg-background">
            <h3 className="text-sm font-medium flex items-center gap-2 mb-4 w-full justify-center">
              <QrCode className="w-4 h-4" /> Scan to Connect
            </h3>
            {qrCodeSvg ? (
              <div 
                className="bg-white p-2 rounded-xl shadow-sm [&>svg]:w-48 [&>svg]:h-48"
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }} 
              />
            ) : (
              <div className="w-48 h-48 bg-muted animate-pulse rounded-xl flex items-center justify-center">
                <span className="text-muted-foreground text-xs">Loading QR...</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center mt-4 max-w-[200px]">
              Scan this QR code using the Shiori Companion mobile app.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
