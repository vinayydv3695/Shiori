import { useState, useEffect, useRef, useCallback } from 'react';
import { getMangaPageUrl } from './useMangaPreloader';

/**
 * Hook for background image decoding with loading/error states.
 * Uses createImageBitmap for off-main-thread decoding when available.
 */
export function useImageDecode(
    bookId: number | null,
    pageIndex: number,
    maxDimension: number = 1600
) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (bookId === null) {
            setUrl(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const imageUrl = await getMangaPageUrl(bookId, pageIndex, maxDimension);
                if (cancelled || !mountedRef.current) return;
                setUrl(imageUrl);
                setLoading(false);
            } catch (err) {
                if (cancelled || !mountedRef.current) return;
                setError(String(err));
                setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [bookId, pageIndex, maxDimension]);

    return { url, loading, error };
}
