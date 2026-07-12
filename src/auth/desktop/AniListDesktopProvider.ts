import { invoke } from '@tauri-apps/api/core';
import { AniListAuthProvider, ViewerInfo } from '../AniListProvider';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from 'sonner';

export class AniListDesktopProvider implements AniListAuthProvider {
    async login(): Promise<void> {
        try {
            const token = await invoke<string>('start_anilist_login');
            usePreferencesStore.getState().updateGeneralSettings({ anilistToken: token });
            toast.success('Successfully linked AniList account');
            window.dispatchEvent(new Event('anilist-auth-changed'));
        } catch (error) {
            console.error('Failed to start AniList login:', error);
            toast.error('Login Failed', { description: String(error) });
        }
    }

    async logout(): Promise<void> {
        usePreferencesStore.getState().updateGeneralSettings({ anilistToken: '' });
        toast.success('Unlinked AniList account');
    }

    async getAccessToken(): Promise<string | null> {
        return usePreferencesStore.getState().preferences?.anilistToken || null;
    }

    async isAuthenticated(): Promise<boolean> {
        const token = await this.getAccessToken();
        return !!token;
    }

    async getViewerInfo(): Promise<ViewerInfo | null> {
        // Desktop doesn't currently require viewer info in UI, but we can fetch it if needed.
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
