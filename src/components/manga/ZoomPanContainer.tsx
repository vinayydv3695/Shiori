import React, { useRef, useEffect, useState } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';

interface ZoomPanContainerProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * Universal Zoom & Pan Container for Manga Reader.
 * Supports:
 *  - 2-finger pinch to zoom (scale 1x to 4.5x) in all reading modes
 *  - 1-finger pan/drag when zoomed in (scale > 1.05)
 *  - 2-finger pinch-in back to 1.0x to reset zoom
 *  - Double-tap with 1 finger to quick-toggle 1x <-> 2.5x zoom
 *  - Automatic zoom reset on page/chapter/mode changes
 */
export function ZoomPanContainer({ children, className = '' }: ZoomPanContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const currentPage = useMangaContentStore(s => s.currentPage);
    const readingMode = useMangaSettingsStore(s => s.readingMode);

    // Keep scale & translation in refs for 60fps touch performance
    const scaleRef = useRef<number>(1);
    const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isZoomed, setIsZoomed] = useState(false);

    // Touch gesture state refs
    const isPinchingRef = useRef(false);
    const isDraggingRef = useRef(false);
    const initialDistRef = useRef<number>(0);
    const initialScaleRef = useRef<number>(1);
    const startTouchRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastTapTimeRef = useRef<number>(0);
    const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const applyTransform = (scale: number, x: number, y: number, animate = false) => {
        if (!contentRef.current) return;
        scaleRef.current = scale;
        posRef.current = { x, y };

        const isCurrentlyZoomed = scale > 1.05;
        setIsZoomed(isCurrentlyZoomed);

        if (animate) {
            contentRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0.2, 1)';
        } else {
            contentRef.current.style.transition = 'none';
        }

        if (scale === 1) {
            contentRef.current.style.transform = 'none';
        } else {
            contentRef.current.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
        }
    };

    const resetZoom = (animate = true) => {
        applyTransform(1, 0, 0, animate);
    };

    // Reset zoom whenever page or reading mode changes
    useEffect(() => {
        resetZoom(false);
    }, [currentPage, readingMode]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getDistance = (t1: Touch, t2: Touch) => {
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            return Math.hypot(dx, dy);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                // 2 Finger Pinch Start
                isPinchingRef.current = true;
                isDraggingRef.current = false;
                initialDistRef.current = getDistance(e.touches[0], e.touches[1]);
                initialScaleRef.current = scaleRef.current;
            } else if (e.touches.length === 1) {
                const touch = e.touches[0];
                const now = Date.now();
                const timeDiff = now - lastTapTimeRef.current;
                const distDiff = Math.hypot(
                    touch.clientX - lastTapPosRef.current.x,
                    touch.clientY - lastTapPosRef.current.y
                );

                // Double tap detection
                if (timeDiff < 300 && distDiff < 35) {
                    e.preventDefault();
                    if (scaleRef.current > 1.05) {
                        resetZoom(true);
                    } else {
                        applyTransform(2.5, 0, 0, true);
                    }
                    lastTapTimeRef.current = 0;
                    return;
                }

                lastTapTimeRef.current = now;
                lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };

                // 1 Finger Drag Start (only if zoomed in)
                if (scaleRef.current > 1.05) {
                    isDraggingRef.current = true;
                    startTouchRef.current = { x: touch.clientX, y: touch.clientY };
                    startPosRef.current = { ...posRef.current };
                }
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && isPinchingRef.current) {
                // 2 Finger Pinching
                e.preventDefault();
                const dist = getDistance(e.touches[0], e.touches[1]);
                if (initialDistRef.current > 0) {
                    const factor = dist / initialDistRef.current;
                    let newScale = Math.min(4.5, Math.max(0.9, initialScaleRef.current * factor));
                    
                    // If pinching below 1.0, allow elastic drag down to 0.9 then snap
                    if (newScale < 1.0) {
                        newScale = 1.0;
                    }
                    
                    applyTransform(newScale, posRef.current.x, posRef.current.y, false);
                }
            } else if (e.touches.length === 1 && isDraggingRef.current && scaleRef.current > 1.05) {
                // 1 Finger Panning when Zoomed
                e.preventDefault();
                const touch = e.touches[0];
                const dx = (touch.clientX - startTouchRef.current.x) / scaleRef.current;
                const dy = (touch.clientY - startTouchRef.current.y) / scaleRef.current;

                let newX = startPosRef.current.x + dx;
                let newY = startPosRef.current.y + dy;

                // Bound panning so the canvas stays partially visible
                const rect = container.getBoundingClientRect();
                const maxPanX = (rect.width * (scaleRef.current - 1)) / (2 * scaleRef.current) + 100;
                const maxPanY = (rect.height * (scaleRef.current - 1)) / (2 * scaleRef.current) + 200;

                newX = Math.max(-maxPanX, Math.min(maxPanX, newX));
                newY = Math.max(-maxPanY, Math.min(maxPanY, newY));

                applyTransform(scaleRef.current, newX, newY, false);
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) {
                isPinchingRef.current = false;
            }
            if (e.touches.length === 0) {
                isDraggingRef.current = false;
                // If pinched back down to normal scale, snap to 1.0
                if (scaleRef.current <= 1.05) {
                    resetZoom(true);
                }
            }
        };

        // Attach touch listeners with passive: false to allow e.preventDefault()
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`zoom-pan-container relative w-full h-full overflow-hidden ${className} ${
                isZoomed ? 'touch-none select-none z-40' : ''
            }`}
            style={{
                touchAction: isZoomed ? 'none' : 'pan-x pan-y',
            }}
        >
            <div
                ref={contentRef}
                className="zoom-pan-content w-full h-full origin-center"
                style={{
                    willChange: 'transform',
                }}
            >
                {children}
            </div>
        </div>
    );
}
