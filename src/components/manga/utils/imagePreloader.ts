/**
 * Preloads a single image into the browser cache.
 */
export function preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve();
        img.onerror = reject;
    });
}

/**
 * Preloads an array of image URLs sequentially to avoid blocking the main thread
 * and overwhelming the network, but gets them into cache before rendering.
 */
export async function preloadImages(urls: string[]): Promise<void> {
    for (const url of urls) {
        try {
            await preloadImage(url);
        } catch (err) {
            console.error(`Failed to preload image: ${url}`, err);
            // Continue preloading the rest even if one fails
        }
    }
}
