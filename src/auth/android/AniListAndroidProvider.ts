import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AniListAuthProvider, ViewerInfo } from '../AniListProvider';
import { toast } from 'sonner';

const ANILIST_CLIENT_ID = '45479'; // Use the client ID registered with shiori://auth
const REDIRECT_URI = 'shiori://auth'; // Must match the Intent Filter

function generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
    }
    return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
    const bytes = new Uint8Array(a);
    const len = bytes.byteLength;
    let base64 = '';
    for (let i = 0; i < len; i++) {
        base64 += String.fromCharCode(bytes[i]);
    }
    return btoa(base64)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export class AniListAndroidProvider implements AniListAuthProvider {
    private isLoggingIn = false;

    async login(): Promise<void> {
        if (this.isLoggingIn) return;
        this.isLoggingIn = true;
        
        try {
            // 1. Build Auth URL using Implicit Grant
            const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token`;

            // 2. Listen for Deep Link Callback with the token
            const unlisten = await listen<{access_token: string}>('oauth-token-received', async (event) => {
                unlisten(); // Stop listening
                
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
                } catch (e: any) {
                    console.error('Failed to save secure token:', e);
                    toast.error('Authentication Failed', { description: e.message || 'Could not save authorization token.' });
                } finally {
                    this.isLoggingIn = false;
                }
            });

            // Fallback for code just in case, though not expected
            const unlistenCode = await listen<{code: string}>('oauth-code-received', async (event) => {
                unlistenCode();
                unlisten();
                toast.error('Authentication Failed', { description: 'Received authorization code instead of token.' });
                this.isLoggingIn = false;
            });

            // 3. Launch Custom Tab
            await invoke('plugin:android-auth|start_oauth_login', { url: authUrl });
        } catch (error) {
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
