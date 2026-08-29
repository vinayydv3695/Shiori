import { useCallback, forwardRef, useImperativeHandle, memo, useRef, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import DOMPurify from 'dompurify';
import { sanitizeBookContent } from '@/lib/sanitize';
import '@/styles/page-flip.css';

interface PageFlipEngineProps {
    currentContent: string;
    chapterIndex?: number;
    nextContent?: string | null;
    prevContent?: string | null;
    flipSpeed: number;
    enabled: boolean;
    animationStyle: 'slide' | 'fade' | 'curl' | 'none';
    onFlipComplete?: (direction: 'forward' | 'backward') => void;
    onRendered?: () => void;
    className?: string;
}

export interface PageFlipHandle {
    flipForward: () => boolean;
    flipBackward: () => boolean;
    isFlipping: () => boolean;
}

/**
 * Framer Motion Page Transition Engine for Shiori EPUB Reader.
 *
 * Supports four clean animation styles:
 * - slide: smooth horizontal slide transition
 * - fade: soft crossfade transition
 * - curl: realistic 3D book page curl with paper perspective & shadow depth
 * - none: instant page switch
 */
export const PageFlipEngine = memo(
    forwardRef<PageFlipHandle, PageFlipEngineProps>(function PageFlipEngine(
        { currentContent, chapterIndex = 0, nextContent, prevContent, flipSpeed, enabled, animationStyle, onFlipComplete, onRendered, className },
        ref
    ) {
        const isFlippingRef = useRef(false);
        const [direction, setDirection] = useState<1 | -1>(1); // 1 = forward, -1 = backward
        const prevIndexRef = useRef<number>(chapterIndex);

        // Detect index/content changes from external navigation (TOC, next chapter, buttons)
        useEffect(() => {
            if (chapterIndex !== prevIndexRef.current) {
                setDirection(chapterIndex > prevIndexRef.current ? 1 : -1);
                prevIndexRef.current = chapterIndex;
            }
            // Trigger rendered notification on content/chapter change
            const timer = setTimeout(() => {
                onRendered?.();
            }, 30);
            return () => clearTimeout(timer);
        }, [chapterIndex, currentContent, onRendered]);

        // ────────────────────────────────────────────────────────────
        // ANIMATION VARIANTS
        // ────────────────────────────────────────────────────────────
        const slideVariants: Variants = {
            enter: (dir: number) => ({
                x: dir > 0 ? '100%' : '-100%',
                opacity: 0.3,
            }),
            center: {
                x: '0%',
                opacity: 1,
            },
            exit: (dir: number) => ({
                x: dir > 0 ? '-100%' : '100%',
                opacity: 0.3,
            }),
        };

        const fadeVariants: Variants = {
            enter: { opacity: 0 },
            center: { opacity: 1 },
            exit: { opacity: 0 },
        };

        const curlVariants: Variants = {
            enter: (dir: number) => ({
                rotateY: dir > 0 ? 0 : -45,
                x: dir > 0 ? '0%' : '-8%',
                scale: dir > 0 ? 0.97 : 1,
                opacity: dir > 0 ? 0.6 : 0.2,
                transformOrigin: 'left center',
            }),
            center: {
                rotateY: 0,
                x: '0%',
                scale: 1,
                opacity: 1,
                transformOrigin: 'left center',
            },
            exit: (dir: number) => ({
                rotateY: dir > 0 ? -45 : 0,
                x: dir > 0 ? '-8%' : '0%',
                scale: dir > 0 ? 1 : 0.97,
                opacity: dir > 0 ? 0.2 : 0.6,
                transformOrigin: 'left center',
            }),
        };

        const noneVariants: Variants = {
            enter: { opacity: 1 },
            center: { opacity: 1 },
            exit: { opacity: 1 },
        };

        const getVariants = () => {
            switch (animationStyle) {
                case 'slide': return slideVariants;
                case 'fade': return fadeVariants;
                case 'curl': return curlVariants;
                case 'none': return noneVariants;
            }
        };

        const getTransition = () => {
            if (animationStyle === 'none') {
                return { duration: 0 };
            }
            const durationSec = Math.max(0.1, flipSpeed / 1000);
            if (animationStyle === 'slide') {
                return {
                    duration: durationSec,
                    ease: [0.25, 1, 0.5, 1] as [number, number, number, number],
                };
            }
            if (animationStyle === 'curl') {
                return {
                    duration: durationSec * 1.1,
                    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
                };
            }
            return {
                duration: durationSec,
                ease: 'easeInOut' as const,
            };
        };

        // ────────────────────────────────────────────────────────────
        // IMPERATIVE FLIP METHODS
        // ────────────────────────────────────────────────────────────
        const handleAnimationComplete = useCallback(
            (dir: 'forward' | 'backward') => {
                isFlippingRef.current = false;
                onFlipComplete?.(dir);
            },
            [onFlipComplete]
        );

        useImperativeHandle(
            ref,
            () => ({
                flipForward: () => {
                    if (!enabled || isFlippingRef.current) return false;
                    isFlippingRef.current = true;
                    setDirection(1);
                    setTimeout(() => handleAnimationComplete('forward'), flipSpeed + 30);
                    return true;
                },

                flipBackward: () => {
                    if (!enabled || isFlippingRef.current) return false;
                    isFlippingRef.current = true;
                    setDirection(-1);
                    setTimeout(() => handleAnimationComplete('backward'), flipSpeed + 30);
                    return true;
                },

                isFlipping: () => isFlippingRef.current,
            }),
            [enabled, flipSpeed, handleAnimationComplete]
        );

        // ────────────────────────────────────────────────────────────
        // MEMOIZE SANITIZATION
        // ────────────────────────────────────────────────────────────
        const safeCurrentContent = useMemo(() => {
            return sanitizeBookContent(currentContent);
        }, [currentContent]);

        // ────────────────────────────────────────────────────────────
        // RENDER — disabled mode (no animation wrapper overhead)
        // ────────────────────────────────────────────────────────────
        if (!enabled || animationStyle === 'none') {
            return (
                <div className={className}>
                    <div
                        className="premium-chapter-content"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(safeCurrentContent) }}
                    />
                </div>
            );
        }

        // ────────────────────────────────────────────────────────────
        // RENDER — animated mode (Slide / Fade)
        // ────────────────────────────────────────────────────────────
        return (
            <div className={`page-transition-container ${className || ''}`}>
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={chapterIndex}
                        custom={direction}
                        variants={getVariants()}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={getTransition()}
                        onAnimationComplete={() => {
                            isFlippingRef.current = false;
                            onRendered?.();
                        }}
                        className="page-transition-page"
                    >
                        <div
                            className="premium-chapter-content"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(safeCurrentContent) }}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        );
    }),
    (prev, next) =>
        prev.currentContent === next.currentContent &&
        prev.chapterIndex === next.chapterIndex &&
        prev.enabled === next.enabled &&
        prev.flipSpeed === next.flipSpeed &&
        prev.animationStyle === next.animationStyle &&
        prev.onRendered === next.onRendered
);
