import { invoke } from '@tauri-apps/api/core';
import { AniListAuthProvider, ViewerInfo } from '../AniListProvider';
import { toast } from 'sonner';

const ANILIST_CLIENT_ID = '45479';
const REDIRECT_URI = 'shiori://auth'; // Must match the Intent Filter

export class AniListAndroidProvider implements AniListAuthProvider {
    private isLoggingIn = false;

    constructor() {
        // Check for any pending OAuth data from a previous session (e.g., app was killed and restarted)
        this.processPendingAuthData();
    }

    private async processPendingAuthData(): Promise<boolean> {
        try {
            const data = await invoke<{access_token?: string; code?: string}>('plugin:android-auth|get_pending_oauth_data');
            if (data.access_token) {
                await invoke('plugin:android-auth|set_secure_token', { token: data.access_token });
                toast.success('Successfully linked AniList account');
                window.dispatchEvent(new Event('anilist-auth-changed'));
                return true;
            } else if (data.code) {
                const token = await invoke<string>('exchange_android_anilist_code', { code: data.code });
                await invoke('plugin:android-auth|set_secure_token', { token });
                toast.success('Successfully linked AniList account');
                window.dispatchEvent(new Event('anilist-auth-changed'));
                return true;
            }
        } catch (error) {
            console.error('Failed to process pending OAuth data:', error);
        }
        return false;
    }

    async login(): Promise<void> {
        if (this.isLoggingIn) return;
        this.isLoggingIn = true;

        try {
            const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

            // Launch Custom Tab for OAuth
            await invoke('plugin:android-auth|start_oauth_login', { url: authUrl });

            // The Custom Tab will redirect to shiori://auth?code=... which triggers
            // onNewIntent() in AuthPlugin.kt, storing the code as pending data.
            // We poll for this pending data because Tauri plugin trigger() events
            // are NOT received by the generic listen() from @tauri-apps/api/event.
            // Instead, we poll after a delay to let the redirect complete.
            await this.pollForPendingAuthData();
        } catch (error) {
            console.error('Failed to start Android AniList login:', error);
            toast.error('Login Failed', { description: error instanceof Error ? error.message : String(error) });
        } finally {
            this.isLoggingIn = false;
        }
    }

    /**
     * Poll for pending OAuth data after the Custom Tab redirects back.
     * The user flow is: Custom Tab opens → user authorizes → AniList redirects to shiori://auth
     * → Android intent filter catches it → onNewIntent stores pending data → we poll here.
     * 
     * We poll repeatedly because there's a variable delay between when the Custom Tab
     * triggers the redirect and when the app regains focus and processes the intent.
     */
    private async pollForPendingAuthData(): Promise<void> {
        const MAX_ATTEMPTS = 60; // Poll for up to 60 seconds
        const POLL_INTERVAL_MS = 1000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            // Wait before polling (the first poll should wait for the user to authorize)
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

            // Check if we're still supposed to be logging in
            if (!this.isLoggingIn) return;

            try {
                const found = await this.processPendingAuthData();
                if (found) return; // Success!
            } catch {
                // Ignore individual poll errors, keep trying
            }
        }

        // If we get here, the poll timed out
        toast.error('Login Timed Out', {
            description: 'AniList authorization was not completed. Please try again.',
        });
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
