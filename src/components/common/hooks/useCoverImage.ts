import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export function useCoverImage(bookId?: number, initialCoverSrc?: string | null) {
    const [coverUrl, setCoverUrl] = useState<string | null>(
        initialCoverSrc ? convertFileSrc(initialCoverSrc) : null
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function loadCover() {
            if (!bookId || initialCoverSrc) return;

            setLoading(true);
            setError(false);

            try {
                const coverPath = await invoke<string | null>('get_cover_path_by_id', { id: bookId });
                if (coverPath && mounted) {
                    setCoverUrl(convertFileSrc(coverPath));
                } else if (mounted) {
                    setError(true);
                }
            } catch (err) {
                console.error("Failed to load cover:", err);
                if (mounted) setError(true);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadCover();
        return () => { mounted = false; };
    }, [bookId, initialCoverSrc]);

    return { coverUrl, loading, error };
}
