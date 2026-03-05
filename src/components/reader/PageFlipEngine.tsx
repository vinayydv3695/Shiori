import { useCallback, forwardRef, useImperativeHandle, memo, useRef, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { sanitizeBookContent } from '@/lib/sanitize';
import '@/styles/page-flip.css';

interface PageFlipEngineProps {
    currentContent: string;
    nextContent: string | null;
    prevContent: string | null;
    flipSpeed: number;
    enabled: boolean;
    animationStyle: 'slide' | 'fade' | 'none';
    onFlipComplete: (direction: 'forward' | 'backward') => void;
    className?: string;
}

export interface PageFlipHandle {
    flipForward: () => boolean;
    flipBackward: () => boolean;
    isFlipping: () => boolean;
}

/**
 * Framer Motion page transition engine.
 *
 * Supports three animation styles:
 * - slide: smooth horizontal slide (default)
 * - fade: crossfade transition
 * - none: instant switch (no animation)
 *
 * KEY DESIGN: The current page sits in NORMAL DOCUMENT FLOW so the container
 * gets its height from the content.
 */
export const PageFlipEngine = memo(
    forwardRef<PageFlipHandle, PageFlipEngineProps>(function PageFlipEngine(
        { currentContent, nextContent, prevContent, flipSpeed, enabled, animationStyle, onFlipComplete, className },
        ref
    ) {
        const isFlippingRef = useRef(false);
        const [direction, setDirection] = useState<1 | -1>(1); // 1 = forward, -1 = backward
        // Monotonic key so AnimatePresence sees a new child on each flip
        const [pageKey, setPageKey] = useState(0);

        // ────────────────────────────────────────────────────────────
        // ANIMATION VARIANTS
        // ────────────────────────────────────────────────────────────
        const slideVariants: Variants = {
            enter: (dir: number) => ({
                x: dir > 0 ? '40%' : '-40%',
                opacity: 0,
            }),
            center: {
                x: 0,
                opacity: 1,
            },
            exit: (dir: number) => ({
                x: dir > 0 ? '-40%' : '40%',
                opacity: 0,
            }),
        };

        const fadeVariants: Variants = {
            enter: { opacity: 0 },
            center: { opacity: 1 },
            exit: { opacity: 0 },
        };

        const noneVariants: Variants = {
            enter: { opacity: 1 },
            center: { opacity: 1 },
            exit: { opacity: 0 },
        };

        const getVariants = () => {
            switch (animationStyle) {
                case 'slide': return slideVariants;
                case 'fade': return fadeVariants;
                case 'none': return noneVariants;
            }
        };

        const getTransition = () => {
            if (animationStyle === 'none') {
                return { duration: 0 };
            }
            const durationSec = flipSpeed / 1000;
            return {
                duration: durationSec,
                ease: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
            };
        };

        // ────────────────────────────────────────────────────────────
        // IMPERATIVE FLIP METHODS
        // ────────────────────────────────────────────────────────────
        const handleAnimationComplete = useCallback(
            (dir: 'forward' | 'backward') => {
                isFlippingRef.current = false;
                onFlipComplete(dir);
            },
            [onFlipComplete]
        );

        useImperativeHandle(
            ref,
            () => ({
                flipForward: () => {
                    if (!enabled || !nextContent || isFlippingRef.current) return false;
                    isFlippingRef.current = true;
                    setDirection(1);
                    setPageKey((k) => k + 1);
                    // Schedule callback after animation
                    setTimeout(() => handleAnimationComplete('forward'), flipSpeed + 50);
                    return true;
                },

                flipBackward: () => {
                    if (!enabled || !prevContent || isFlippingRef.current) return false;
                    isFlippingRef.current = true;
                    setDirection(-1);
                    setPageKey((k) => k + 1);
                    setTimeout(() => handleAnimationComplete('backward'), flipSpeed + 50);
                    return true;
                },

                isFlipping: () => isFlippingRef.current,
            }),
            [enabled, nextContent, prevContent, flipSpeed, handleAnimationComplete]
        );

        // ────────────────────────────────────────────────────────────
        // RENDER — disabled mode (no animation wrapper overhead)
        // ────────────────────────────────────────────────────────────
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

        // ────────────────────────────────────────────────────────────
        // RENDER — animated mode
        // ────────────────────────────────────────────────────────────
        return (
            <div className={`page-transition-container ${className || ''}`}>
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={pageKey}
                        custom={direction}
                        variants={getVariants()}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={getTransition()}
                        className="page-transition-page"
                    >
                        <div
                            className="premium-chapter-content"
                            dangerouslySetInnerHTML={{ __html: sanitizeBookContent(currentContent) }}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        );
    }),
    (prev, next) =>
        prev.currentContent === next.currentContent &&
        prev.enabled === next.enabled &&
        prev.flipSpeed === next.flipSpeed &&
        prev.animationStyle === next.animationStyle
);
