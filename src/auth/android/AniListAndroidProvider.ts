import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AniListAuthProvider, ViewerInfo } from '../AniListProvider';
import { toast } from 'sonner';

const ANILIST_CLIENT_ID = import.meta.env.VITE_ANILIST_ANDROID_CLIENT_ID ?? '';
const REDIRECT_URI = 'shiori://auth'; // Must match the Intent Filter

export class AniListAndroidProvider implements AniListAuthProvider {
    private isLoggingIn = false;

    async login(): Promise<void> {
        if (this.isLoggingIn) return;
        this.isLoggingIn = true;
        
        let unlistenToken: (() => void) | undefined;
        let unlistenCode: (() => void) | undefined;

        try {
            const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

            unlistenToken = await listen<{access_token: string}>('oauth-token-received', async (event) => {
                unlistenToken?.();
                unlistenCode?.();
                
                const token = event.payload.access_token;
                if (!token) {
                    toast.error('Authentication Failed', { description: 'No access token received.' });
                    this.isLoggingIn = false;
                    return;
                }

                try {
                    await invoke('plugin:android-auth|set_secure_token', { token });
                    toast.success('Successfully linked AniList account');
                    window.dispatchEvent(new Event('anilist-auth-changed'));
                } catch (e: unknown) {
                    console.error('Failed to save secure token:', e);
                    toast.error('Authentication Failed', {
                        description: e instanceof Error ? e.message : 'Could not save authorization token.',
                    });
                } finally {
                    this.isLoggingIn = false;
                }
            });

            unlistenCode = await listen<{code: string}>('oauth-code-received', async (event) => {
                unlistenCode?.();
                unlistenToken?.();

                try {
                    const token = await invoke<string>('exchange_android_anilist_code', { code: event.payload.code });
                    await invoke('plugin:android-auth|set_secure_token', { token });
                    toast.success('Successfully linked AniList account');
                    window.dispatchEvent(new Event('anilist-auth-changed'));
                } catch (error) {
                    console.error('Failed to exchange AniList authorization code:', error);
                    toast.error('Authentication Failed', {
                        description: error instanceof Error ? error.message : 'Could not complete AniList login.',
                    });
                } finally {
                    this.isLoggingIn = false;
                }
            });

            await invoke('plugin:android-auth|start_oauth_login', { url: authUrl });
        } catch (error) {
            unlistenToken?.();
            unlistenCode?.();
            console.error('Failed to start Android AniList login:', error);
            toast.error('Login Failed', { description: 'Could not launch AniList authentication.' });
            this.isLoggingIn = false;
        }
    }

    async logout(): Promise<void> {
        try {
            await invoke('plugin:android-auth|clear_secure_token');
            toast.success('Unlinked AniList account');
            window.dispatchEvent(new Event('anilist-auth-changed'));
        } catch (error) {
            console.error('Failed to logout:', error);
            toast.error('Logout Failed');
        }
    }

    async getAccessToken(): Promise<string | null> {
        try {
            const result = await invoke<{token: string}>('plugin:android-auth|get_secure_token');
            return result.token || null;
        } catch (error) {
            console.error('Failed to get secure token:', error);
            return null;
        }
    }

    async isAuthenticated(): Promise<boolean> {
        const token = await this.getAccessToken();
        return !!token;
    }

    async getViewerInfo(): Promise<ViewerInfo | null> {
        const token = await this.getAccessToken();
        if (!token) return null;

        try {
            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        query {
                            Viewer {
                                id
                                name
                                avatar {
                                    large
                                }
                            }
                        }
                    `
                })
            });

            const data = await response.json();
            if (data?.data?.Viewer) {
                return {
                    id: data.data.Viewer.id,
                    name: data.data.Viewer.name,
                    avatar: data.data.Viewer.avatar?.large,
                };
            }
        } catch (error) {
            console.error('Failed to fetch AniList viewer info:', error);
        }
        return null;
    }
}
