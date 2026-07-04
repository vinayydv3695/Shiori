import { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useDoodleStore, type DoodleStroke } from '@/store/doodleStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';

interface DoodleCanvasProps {
    bookId: number;
    pageId: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * HTML5 Canvas overlay for doodle/drawing functionality.
 * - Renders on top of book content
 * - Captures pointer events (mouse, touch, stylus)
 * - Stores coordinates as percentages for zoom-safety
 * - Debounced persistence to SQLite
 */
export const DoodleCanvas = memo(function DoodleCanvas({
    bookId,
    pageId,
    containerRef,
}: DoodleCanvasProps) {
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<[number, number, number][]>([]);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number>(0);
    const containerRectRef = useRef<{w: number, h: number}>({w: 1, h: 1});

    const {
        isDoodleMode,
        tool,
        penColor,
        penWidth,
        strokes,
        addStroke,
        loadStrokes,
        isDirty,
        markClean,
    } = useDoodleStore();

    // ────────────────────────────────────────────────────────────
    // LOAD DOODLES FROM DATABASE ON PAGE CHANGE
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!bookId || !pageId) return;

        const loadFromDb = async () => {
            try {
                const doodle = await api.getDoodle(bookId, pageId);
                if (doodle && doodle.strokes_json) {
                    const parsed = JSON.parse(doodle.strokes_json) as DoodleStroke[];
                    loadStrokes(parsed);
                } else {
                    loadStrokes([]);
                }
             } catch (err) {
                 logger.warn('[DoodleCanvas] Failed to load doodles:', err);
                 loadStrokes([]);
             }
        };

        loadFromDb();
    }, [bookId, pageId, loadStrokes]);

    // ────────────────────────────────────────────────────────────
    // DEBOUNCED SAVE
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isDirty) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            try {
                const currentStrokes = useDoodleStore.getState().strokes;
                const json = JSON.stringify(currentStrokes);

                 // Check 5MB limit
                 if (json.length > 5 * 1024 * 1024) {
                     logger.warn('[DoodleCanvas] Doodle data exceeds 5MB, skipping save');
                     return;
                 }

                if (currentStrokes.length === 0) {
                    await api.deleteDoodle(bookId, pageId);
                } else {
                    await api.saveDoodle(bookId, pageId, json);
                }
                markClean();
             } catch (err) {
                 logger.warn('[DoodleCanvas] Failed to save doodles:', err);
             }
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [isDirty, bookId, pageId, markClean]);

    // ────────────────────────────────────────────────────────────
    // POINTER EVENT HANDLERS
    // ────────────────────────────────────────────────────────────
    const getPointerPosition = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            const container = containerRef.current;
            if (!container) return { x: 0, y: 0, pressure: 0.5 };

            const rect = container.getBoundingClientRect();
            containerRectRef.current = { w: rect.width, h: rect.height };
            
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const pressure = e.pressure > 0 ? e.pressure : 0.5;

            return { x, y, pressure };
        },
        [containerRef]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            isDrawingRef.current = true;
            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current = [[x, y, pressure]];

            (e.target as Element).setPointerCapture?.(e.pointerId);
        },
        [isDoodleMode, getPointerPosition]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDrawingRef.current || !isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            if (now - lastFrameRef.current < 16) return; // ~60fps throttle
            lastFrameRef.current = now;

            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current.push([x, y, pressure]);
            
            setForceRender(prev => prev + 1);
        },
        [isDoodleMode, getPointerPosition]
    );

    const [, setForceRender] = useState(0);

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDrawingRef.current || !isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            isDrawingRef.current = false;
            (e.target as Element).releasePointerCapture?.(e.pointerId);

            if (currentStrokeRef.current.length >= 2) {
                const stroke: DoodleStroke = {
                    id: crypto.randomUUID(),
                    tool,
                    color: penColor,
                    width: penWidth,
                    points: [...currentStrokeRef.current],
                    timestamp: Date.now(),
                };
                addStroke(stroke);
            }

            currentStrokeRef.current = [];
            setForceRender(prev => prev + 1);
        },
        [isDoodleMode, tool, penColor, penWidth, addStroke]
    );

    // ────────────────────────────────────────────────────────────
    // RENDER HELPERS
    // ────────────────────────────────────────────────────────────
    const renderPath = (points: [number, number, number][]) => {
        if (points.length === 0) return '';
        let d = `M ${points[0][0]} ${points[0][1]}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i][0]} ${points[i][1]}`;
        }
        return d;
    };

    const penStrokes = strokes.filter(s => s.tool !== 'eraser');
    const eraserStrokes = strokes.filter(s => s.tool === 'eraser');
    
    if (isDrawingRef.current && currentStrokeRef.current.length > 1) {
        const currentAsStroke: DoodleStroke = {
            id: 'current',
            tool,
            color: penColor,
            width: penWidth,
            points: currentStrokeRef.current,
            timestamp: Date.now(),
        };
        if (tool === 'eraser') {
            eraserStrokes.push(currentAsStroke);
        } else {
            penStrokes.push(currentAsStroke);
        }
    }

    // ────────────────────────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────────────────────────

    return (
        <svg
            className="doodle-canvas"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: isDoodleMode ? 10 : 5,
                pointerEvents: isDoodleMode ? 'auto' : 'none',
                cursor: isDoodleMode
                    ? tool === 'eraser'
                        ? 'cell'
                        : 'crosshair'
                    : 'default',
                touchAction: isDoodleMode ? 'none' : 'auto',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <defs>
                <mask id="eraser-mask">
                    <rect x="0" y="0" width="100" height="100" fill="white" />
                    {eraserStrokes.map(stroke => (
                        <path
                            key={stroke.id}
                            d={renderPath(stroke.points)}
                            fill="none"
                            stroke="black"
                            strokeWidth={stroke.width * 3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </mask>
            </defs>

            <g mask="url(#eraser-mask)">
                {penStrokes.map(stroke => (
                    <path
                        key={stroke.id}
                        d={renderPath(stroke.points)}
                        fill="none"
                        stroke={stroke.color}
                        strokeWidth={stroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </g>
        </svg>
    );
}, (prev, next) => prev.pageId === next.pageId && prev.bookId === next.bookId);
