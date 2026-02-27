import { useCallback, memo } from 'react';

interface GestureZonesProps {
    onPrevPage: () => void;
    onNextPage: () => void;
    onToggleToolbar: () => void;
    enabled: boolean;
}

/**
 * Invisible touch gesture zones for tablet/touch navigation.
 * Left 20% = prev page, Right 20% = next page, Center 60% = toggle toolbar.
 * Only active on touch devices or when explicitly enabled.
 */
export const GestureZones = memo(function GestureZones({
    onPrevPage,
    onNextPage,
    onToggleToolbar,
    enabled,
}: GestureZonesProps) {
    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!enabled) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const relativeX = (e.clientX - rect.left) / rect.width;

            if (relativeX < 0.2) {
                onPrevPage();
            } else if (relativeX > 0.8) {
                onNextPage();
            } else {
                onToggleToolbar();
            }
        },
        [enabled, onPrevPage, onNextPage, onToggleToolbar]
    );

    if (!enabled) return null;

    return (
        <div
            className="gesture-zones"
            onClick={handleClick}
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 3,
                cursor: 'default',
                // Debug: uncomment to visualize zones
                // background: 'linear-gradient(to right, rgba(255,0,0,0.1) 0% 20%, transparent 20% 80%, rgba(0,0,255,0.1) 80% 100%)',
            }}
            aria-hidden="true"
        />
    );
});
