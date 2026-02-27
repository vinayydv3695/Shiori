import { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle, memo } from 'react';
import { sanitizeBookContent } from '@/lib/sanitize';
import '@/styles/page-flip.css';

interface PageFlipEngineProps {
    currentContent: string;
    nextContent: string | null;
    prevContent: string | null;
    flipSpeed: number;
    enabled: boolean;
    onFlipComplete: (direction: 'forward' | 'backward') => void;
    className?: string;
}

export interface PageFlipHandle {
    flipForward: () => boolean;
    flipBackward: () => boolean;
    isFlipping: () => boolean;
}

type FlipState = 'idle' | 'flipping-forward' | 'flipping-backward';

/**
 * CSS 3D page-flip animation engine.
 *
 * KEY DESIGN: The current page sits in NORMAL DOCUMENT FLOW so the container
 * gets its height from the content. Only the animating overlay layers use
 * position:absolute. This prevents the blank-page bug where the container
 * would collapse to 0px when all children were absolutely positioned.
 */
export const PageFlipEngine = memo(
    forwardRef<PageFlipHandle, PageFlipEngineProps>(function PageFlipEngine(
        { currentContent, nextContent, prevContent, flipSpeed, enabled, onFlipComplete, className },
        ref
    ) {
        const containerRef = useRef<HTMLDivElement>(null);
        const shadowRef = useRef<HTMLCanvasElement>(null);
        const flipStateRef = useRef<FlipState>('idle');
        const [flipState, setFlipState] = useState<FlipState>('idle');
        const animationFrameRef = useRef<number | null>(null);

        // ────────────────────────────────────────────────────────────
        // SET CSS VARIABLE FOR FLIP SPEED
        // ────────────────────────────────────────────────────────────
        useEffect(() => {
            if (containerRef.current) {
                containerRef.current.style.setProperty('--flip-duration', `${flipSpeed}ms`);
            }
        }, [flipSpeed]);

        // ────────────────────────────────────────────────────────────
        // SHADOW CANVAS RENDERING
        // ────────────────────────────────────────────────────────────
        const renderShadow = useCallback((progress: number) => {
            const canvas = shadowRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);

            const foldX = width * (1 - progress);
            const sw = 40;

            const gradient = ctx.createLinearGradient(foldX - sw, 0, foldX + sw / 2, 0);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.4, `rgba(0,0,0,${0.15 * Math.sin(progress * Math.PI)})`);
            gradient.addColorStop(0.6, `rgba(0,0,0,${0.08 * Math.sin(progress * Math.PI)})`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(foldX - sw, 0, sw * 1.5, height);
        }, []);

        const animateShadow = useCallback(
            (startTime: number, duration: number) => {
                const tick = () => {
                    const elapsed = performance.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    renderShadow(progress);
                    if (progress < 1) {
                        animationFrameRef.current = requestAnimationFrame(tick);
                    }
                };
                animationFrameRef.current = requestAnimationFrame(tick);
            },
            [renderShadow]
        );

        // ────────────────────────────────────────────────────────────
        // RESIZE SHADOW CANVAS
        // ────────────────────────────────────────────────────────────
        useEffect(() => {
            const resize = () => {
                const canvas = shadowRef.current;
                const container = containerRef.current;
                if (!canvas || !container) return;
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
            };

            resize();
            const obs = new ResizeObserver(resize);
            if (containerRef.current) obs.observe(containerRef.current);
            return () => obs.disconnect();
        }, []);

        // ────────────────────────────────────────────────────────────
        // ANIMATION END HANDLER
        // ────────────────────────────────────────────────────────────
        const handleAnimationEnd = useCallback(
            (direction: 'forward' | 'backward') => {
                flipStateRef.current = 'idle';
                setFlipState('idle');

                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }

                const canvas = shadowRef.current;
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx?.clearRect(0, 0, canvas.width, canvas.height);
                }

                onFlipComplete(direction);
            },
            [onFlipComplete]
        );

        // ────────────────────────────────────────────────────────────
        // IMPERATIVE FLIP METHODS
        // ────────────────────────────────────────────────────────────
        useImperativeHandle(
            ref,
            () => ({
                flipForward: () => {
                    if (!enabled || !nextContent || flipStateRef.current !== 'idle') return false;
                    flipStateRef.current = 'flipping-forward';
                    setFlipState('flipping-forward');
                    animateShadow(performance.now(), flipSpeed);
                    return true;
                },

                flipBackward: () => {
                    if (!enabled || !prevContent || flipStateRef.current !== 'idle') return false;
                    flipStateRef.current = 'flipping-backward';
                    setFlipState('flipping-backward');
                    animateShadow(performance.now(), flipSpeed);
                    return true;
                },

                isFlipping: () => flipStateRef.current !== 'idle',
            }),
            [enabled, nextContent, prevContent, flipSpeed, animateShadow]
        );

        // Cleanup
        useEffect(() => {
            return () => {
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            };
        }, []);

        // ────────────────────────────────────────────────────────────
        // RENDER
        // ────────────────────────────────────────────────────────────

        // When disabled, render content directly (no wrapper overhead)
        if (!enabled) {
            return (
                <div className={className}>
                    <div
                        className="premium-chapter-content"
                        dangerouslySetInnerHTML={{ __html: sanitizeBookContent(currentContent) }}
                    />
                </div>
            );
        }

        return (
            <div ref={containerRef} className={`page-flip-container ${className || ''}`}>
                {/*
          CURRENT PAGE — position:relative (normal flow).
          This is what gives the container its height.
        */}
                <div
                    className={`page-flip-current ${flipState === 'flipping-forward' ? 'page-flip-current--flipping-forward' : ''
                        }`}
                    onAnimationEnd={() => {
                        if (flipState === 'flipping-forward') handleAnimationEnd('forward');
                    }}
                >
                    <div
                        className="premium-chapter-content"
                        dangerouslySetInnerHTML={{ __html: sanitizeBookContent(currentContent) }}
                    />
                </div>

                {/* NEXT PAGE — absolute layer underneath, revealed during forward flip */}
                {flipState === 'flipping-forward' && nextContent && (
                    <div className="page-flip-layer page-flip-layer--next">
                        <div
                            className="premium-chapter-content"
                            dangerouslySetInnerHTML={{ __html: sanitizeBookContent(nextContent) }}
                        />
                    </div>
                )}

                {/* PREV PAGE — absolute layer on top, flips in during backward flip */}
                {flipState === 'flipping-backward' && prevContent && (
                    <div
                        className="page-flip-layer page-flip-layer--prev page-flip-layer--flipping-backward"
                        onAnimationEnd={() => handleAnimationEnd('backward')}
                    >
                        <div
                            className="premium-chapter-content"
                            dangerouslySetInnerHTML={{ __html: sanitizeBookContent(prevContent) }}
                        />
                    </div>
                )}

                {/* Shadow overlay canvas */}
                <canvas
                    ref={shadowRef}
                    className={`page-flip-shadow ${flipState !== 'idle' ? 'page-flip-shadow--active' : ''}`}
                />
            </div>
        );
    }),
    (prev, next) =>
        prev.currentContent === next.currentContent &&
        prev.enabled === next.enabled &&
        prev.flipSpeed === next.flipSpeed
);
