import { useEffect, useRef, useCallback, memo } from 'react';
import { useDoodleStore, type DoodleStroke } from '@/store/doodleStore';
import { api } from '@/lib/tauri';

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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<[number, number, number][]>([]);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number>(0);

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
    // CANVAS SIZING (match content container)
    // ────────────────────────────────────────────────────────────
    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(dpr, dpr);
        }

        // Redraw all strokes after resize
        redrawAllStrokes();
    }, [strokes]);

    useEffect(() => {
        resizeCanvas();
        const observer = new ResizeObserver(resizeCanvas);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        return () => observer.disconnect();
    }, [resizeCanvas]);

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
                console.warn('[DoodleCanvas] Failed to load doodles:', err);
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
                    console.warn('[DoodleCanvas] Doodle data exceeds 5MB, skipping save');
                    return;
                }

                if (currentStrokes.length === 0) {
                    await api.deleteDoodle(bookId, pageId);
                } else {
                    await api.saveDoodle(bookId, pageId, json);
                }
                markClean();
            } catch (err) {
                console.warn('[DoodleCanvas] Failed to save doodles:', err);
            }
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [isDirty, bookId, pageId, markClean]);

    // ────────────────────────────────────────────────────────────
    // STROKE RENDERING
    // ────────────────────────────────────────────────────────────
    const getCanvasDimensions = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return { w: 1, h: 1 };
        const dpr = window.devicePixelRatio || 1;
        return { w: canvas.width / dpr, h: canvas.height / dpr };
    }, []);

    const drawStroke = useCallback(
        (ctx: CanvasRenderingContext2D, stroke: DoodleStroke, dims: { w: number; h: number }) => {
            if (stroke.points.length < 2) return;

            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (stroke.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = stroke.width * 3;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = stroke.color;
                ctx.lineWidth = stroke.width;
            }

            const [startX, startY] = [
                (stroke.points[0][0] / 100) * dims.w,
                (stroke.points[0][1] / 100) * dims.h,
            ];
            ctx.moveTo(startX, startY);

            for (let i = 1; i < stroke.points.length; i++) {
                const [x, y, pressure] = stroke.points[i];
                const px = (x / 100) * dims.w;
                const py = (y / 100) * dims.h;

                // Apply pressure-based width variation
                if (stroke.tool !== 'eraser' && pressure > 0) {
                    ctx.lineWidth = stroke.width * (0.5 + pressure * 0.8);
                }

                ctx.lineTo(px, py);
            }

            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        },
        []
    );

    const redrawAllStrokes = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const dims = { w: canvas.width / dpr, h: canvas.height / dpr };

        ctx.clearRect(0, 0, dims.w, dims.h);

        const currentStrokes = useDoodleStore.getState().strokes;
        for (const stroke of currentStrokes) {
            drawStroke(ctx, stroke, dims);
        }
    }, [drawStroke]);

    // Redraw when strokes change (undo/redo/clear/load)
    useEffect(() => {
        redrawAllStrokes();
    }, [strokes, redrawAllStrokes]);

    // ────────────────────────────────────────────────────────────
    // POINTER EVENT HANDLERS
    // ────────────────────────────────────────────────────────────
    const getPointerPosition = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const pressure = e.pressure > 0 ? e.pressure : 0.5;

            return { x, y, pressure };
        },
        []
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!isDoodleMode) return;
            e.preventDefault();
            e.stopPropagation();

            isDrawingRef.current = true;
            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current = [[x, y, pressure]];

            // Capture pointer for smooth tracking
            canvasRef.current?.setPointerCapture(e.pointerId);
        },
        [isDoodleMode, getPointerPosition]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!isDrawingRef.current || !isDoodleMode) return;
            e.preventDefault();

            const now = performance.now();
            // Throttle to ~60fps via rAF
            if (now - lastFrameRef.current < 16) return;
            lastFrameRef.current = now;

            const { x, y, pressure } = getPointerPosition(e);
            currentStrokeRef.current.push([x, y, pressure]);

            // Draw incrementally (only the new segment)
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dims = getCanvasDimensions();
            const points = currentStrokeRef.current;

            if (points.length < 2) return;

            const prev = points[points.length - 2];
            const curr = points[points.length - 1];

            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = penWidth * 3;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = penColor;
                ctx.lineWidth = penWidth * (0.5 + pressure * 0.8);
            }

            ctx.moveTo((prev[0] / 100) * dims.w, (prev[1] / 100) * dims.h);
            ctx.lineTo((curr[0] / 100) * dims.w, (curr[1] / 100) * dims.h);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        },
        [isDoodleMode, tool, penColor, penWidth, getPointerPosition, getCanvasDimensions]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!isDrawingRef.current) return;
            e.preventDefault();

            isDrawingRef.current = false;
            canvasRef.current?.releasePointerCapture(e.pointerId);

            if (currentStrokeRef.current.length >= 2) {
                const stroke: DoodleStroke = {
                    id: crypto.randomUUID(),
                    tool,
                    color: penColor,
                    width: penWidth,
                    points: currentStrokeRef.current,
                    timestamp: Date.now(),
                };
                addStroke(stroke);
            }

            currentStrokeRef.current = [];
        },
        [tool, penColor, penWidth, addStroke]
    );

    // ────────────────────────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────────────────────────

    return (
        <canvas
            ref={canvasRef}
            className="doodle-canvas"
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
        />
    );
}, (prev, next) => prev.pageId === next.pageId && prev.bookId === next.bookId);
