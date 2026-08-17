import { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useDoodleStore, type DoodleStroke } from '@/store/doodleStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';

interface DoodleCanvasProps {
    bookId: number;
    pageId: string;
    containerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * HTML5 / SVG Canvas overlay for doodle/drawing functionality.
 * - Renders on top of book content
 * - Captures pointer events (mouse, touch, stylus)
 * - Stores coordinates as percentages (0..100) for zoom-safety
 * - Debounced persistence to SQLite
 */
export const DoodleCanvas = memo(function DoodleCanvas({
    bookId,
    pageId,
}: DoodleCanvasProps) {
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<[number, number, number][]>([]);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number>(0);
    const localSvgRef = useRef<SVGSVGElement>(null);
    const [, setForceRender] = useState(0);

    const {
        isDoodleMode,
        tool,
        penColor,
        penWidth,
        strokesMap,
        addStroke,
        loadStrokes,
        isDirtyMap,
        markClean,
        setActivePage,
    } = useDoodleStore();

    const strokes = strokesMap[pageId] || [];
    const isDirty = isDirtyMap[pageId] || false;

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
                    loadStrokes(pageId, parsed);
                } else {
                    loadStrokes(pageId, []);
                }
            } catch (err) {
                logger.warn('[DoodleCanvas] Failed to load doodles:', err);
                loadStrokes(pageId, []);
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
                const currentStrokes = useDoodleStore.getState().strokesMap[pageId] || [];
                const json = JSON.stringify(currentStrokes);

                if (json.length > 5 * 1024 * 1024) {
                    logger.warn('[DoodleCanvas] Doodle data exceeds 5MB, skipping save');
                    return;
                }

                if (currentStrokes.length === 0) {
                    await api.deleteDoodle(bookId, pageId);
                } else {
                    await api.saveDoodle(bookId, pageId, json);
                }
                markClean(pageId);
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
            const svg = localSvgRef.current || e.currentTarget;
            if (!svg) return { x: 0, y: 0, pressure: e.pressure || 0.5 };

            const rect = svg.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return { x: 0, y: 0, pressure: e.pressure || 0.5 };
            }
            
            const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            const pressure = e.pressure > 0 ? e.pressure : 0.5;

            return { x, y, pressure };
        },
        []
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            setActivePage(pageId);

            isDrawingRef.current = true;
            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current = [[x, y, pressure]];

            try {
                (e.target as Element).setPointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            setForceRender(prev => prev + 1);
        },
        [isDoodleMode, getPointerPosition, pageId, setActivePage]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDrawingRef.current || !isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            if (now - lastFrameRef.current < 12) return; // ~80fps throttle
            lastFrameRef.current = now;

            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current.push([x, y, pressure]);
            
            setForceRender(prev => prev + 1);
        },
        [isDoodleMode, getPointerPosition]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!isDrawingRef.current || !isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            isDrawingRef.current = false;
            try {
                (e.target as Element).releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }

            if (currentStrokeRef.current.length >= 1) {
                const points = [...currentStrokeRef.current];
                if (points.length === 1) {
                    points.push([points[0][0] + 0.05, points[0][1] + 0.05, points[0][2]]);
                }
                const stroke: DoodleStroke = {
                    id: crypto.randomUUID(),
                    tool,
                    color: penColor,
                    width: penWidth,
                    points,
                    timestamp: Date.now(),
                };
                addStroke(pageId, stroke);
            }

            currentStrokeRef.current = [];
            setForceRender(prev => prev + 1);
        },
        [isDoodleMode, tool, penColor, penWidth, addStroke, pageId]
    );

    // ────────────────────────────────────────────────────────────
    // RENDER HELPERS
    // ────────────────────────────────────────────────────────────
    const renderPath = (points: [number, number, number][]) => {
        if (!points || points.length === 0) return '';
        if (points.length === 1) {
            return `M ${points[0][0]} ${points[0][1]} L ${points[0][0] + 0.01} ${points[0][1] + 0.01}`;
        }
        let d = `M ${points[0][0]} ${points[0][1]}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i][0]} ${points[i][1]}`;
        }
        return d;
    };

    const penStrokes = [...strokes.filter(s => s.tool !== 'eraser')];
    const eraserStrokes = [...strokes.filter(s => s.tool === 'eraser')];
    
    if (isDrawingRef.current && currentStrokeRef.current.length > 0) {
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
            ref={localSvgRef}
            className="doodle-canvas"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: isDoodleMode ? 100 : 5,
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
                <mask id={`eraser-mask-${pageId}`}>
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

            <g mask={`url(#eraser-mask-${pageId})`}>
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
});

export default DoodleCanvas;
