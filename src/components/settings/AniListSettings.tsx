import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { anilistAuth, ViewerInfo } from '@/auth';
import { isAndroid, api } from '@/lib/tauri';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from 'sonner';

export function AniListSettings() {
    const preferences = usePreferencesStore((state) => state.preferences);
    const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings);
    
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            if (isAndroid) {
                const auth = await anilistAuth.isAuthenticated();
                setIsAuthenticated(auth);
                if (auth) {
                    const info = await anilistAuth.getViewerInfo();
                    setViewerInfo(info);
                } else {
                    setViewerInfo(null);
                }
            } else {
                // Desktop uses preferences
                setIsAuthenticated(!!preferences?.anilistToken);
            }
            setLoading(false);
        };

        checkAuth();

        const handleAuthChange = () => checkAuth();
        window.addEventListener('anilist-auth-changed', handleAuthChange);
        return () => window.removeEventListener('anilist-auth-changed', handleAuthChange);
    }, [preferences?.anilistToken]);

    const handleLogin = async () => {
        await anilistAuth.login();
    };

    const handleLogout = async () => {
        await anilistAuth.logout();
    };

    if (loading) return <div>Loading AniList status...</div>;

    if (isAndroid) {
        return (
            <div className="flex flex-col gap-4 w-full">
                {isAuthenticated ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-lg border">
                            {viewerInfo?.avatar && (
                                <img src={viewerInfo.avatar} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
                            )}
                            <div className="flex flex-col flex-1">
                                <p className="text-sm font-medium text-green-600 dark:text-green-500">
                                    ✓ Connected to AniList
                                </p>
                                {viewerInfo?.name && (
                                    <p className="text-sm text-muted-foreground font-semibold">
                                        {viewerInfo.name}
                                    </p>
                                )}
                            </div>
                            <Button variant="destructive" size="sm" onClick={handleLogout}>
                                Disconnect
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 p-3 rounded-md text-sm">
                            Login with AniList to sync your library progress.
                        </div>
                        <Button onClick={handleLogin}>
                            Login with AniList
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    // Desktop
    return (
        <div className="flex flex-col gap-4 w-full">
            {preferences?.anilistToken ? (
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-green-600 dark:text-green-500">
                        ✓ Connected to AniList
                    </p>
                    <Button variant="destructive" size="sm" onClick={handleLogout}>
                        Disconnect
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <Button onClick={handleLogin}>
                        Login with AniList
                    </Button>
                    <div className="flex items-center gap-2">
                        <Input
                            type="password"
                            placeholder="Or manually paste token..."
                            value={preferences?.anilistToken || ''}
                            onChange={(e) => {
                                updateGeneralSettings({ anilistToken: e.target.value });
                                if (e.target.value) {
                                    toast.success('AniList token saved');
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
