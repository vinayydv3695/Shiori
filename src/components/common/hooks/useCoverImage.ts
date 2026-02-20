import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useCoverImage(bookId?: number, initialCoverSrc?: string | null) {
    const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverSrc || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mounted = true;
        let objectUrl: string | null = null;

        async function loadCover() {
            // If we already have a direct passed URL/file src, or no bookId skip
            if (!bookId || initialCoverSrc) return;

            setLoading(true);
            setError(false);

            try {
                const responseData = await invoke<Uint8Array>('get_cover_by_id', { id: bookId });
                const blob = new Blob([new Uint8Array(responseData)], { type: 'image/jpeg' });
                objectUrl = URL.createObjectURL(blob);

                if (mounted) {
                    setCoverUrl(objectUrl);
                }
            } catch (err) {
                console.error("Failed to load cover:", err);
                if (mounted) setError(true);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadCover();

        return () => {
            mounted = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [bookId, initialCoverSrc]);

    return { coverUrl, loading, error };
}
