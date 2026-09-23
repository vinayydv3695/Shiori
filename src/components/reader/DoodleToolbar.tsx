import { memo } from 'react';
import { useDoodleStore } from '@/store/doodleStore';
import { ReaderTooltip } from '@/components/reader/ReaderTooltip';

const PRESET_COLORS = [
    '#1A1A2E', // ink black
    '#E74C3C', // red
    '#3498DB', // blue
    '#27AE60', // green
    '#F39C12', // amber
    '#8E44AD', // purple
    '#E91E63', // pink
    '#00BCD4', // teal
];

/**
 * Floating toolbar for doodle mode.
 * Shows pen color, width, undo/redo, clear, and exit controls.
 */
export const DoodleToolbar = memo(function DoodleToolbar() {
    const {
        isDoodleMode,
        tool,
        penColor,
        penWidth,
        strokesMap,
        undoStackMap,
        redoStackMap,
        activePageId,
        setTool,
        setPenColor,
        setPenWidth,
        undo,
        redo,
        clearAll,
        setDoodleMode,
    } = useDoodleStore();

    if (!isDoodleMode) return null;

    const strokes = activePageId ? (strokesMap[activePageId] || []) : [];
    const undoStack = activePageId ? (undoStackMap[activePageId] || []) : [];
    const redoStack = activePageId ? (redoStackMap[activePageId] || []) : [];

    return (
        <div className="doodle-toolbar" role="toolbar" aria-label="Drawing tools">
            {/* Tool Selection */}
            <div className="doodle-toolbar__group">
                <ReaderTooltip content="Pen" side="top">
                    <button
                        className={`doodle-toolbar__btn ${tool === 'pen' ? 'doodle-toolbar__btn--active' : ''}`}
                        onClick={() => setTool('pen')}
                        aria-label="Pen tool"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                    </button>
                </ReaderTooltip>
                <ReaderTooltip content="Eraser" side="top">
                    <button
                        className={`doodle-toolbar__btn ${tool === 'eraser' ? 'doodle-toolbar__btn--active' : ''}`}
                        onClick={() => setTool('eraser')}
                        aria-label="Eraser tool"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                            <path d="M22 21H7" />
                            <path d="m5 11 9 9" />
                        </svg>
                    </button>
                </ReaderTooltip>
            </div>

            {/* Divider */}
            <div className="doodle-toolbar__divider" />

            {/* Color Picker */}
            <div className="doodle-toolbar__group doodle-toolbar__colors">
                {PRESET_COLORS.map((color) => (
                    <ReaderTooltip key={color} content={color} side="top">
                        <button
                            className={`doodle-toolbar__color ${penColor === color ? 'doodle-toolbar__color--active' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setPenColor(color)}
                            aria-label={`Color ${color}`}
                        />
                    </ReaderTooltip>
                ))}
            </div>

            {/* Divider */}
            <div className="doodle-toolbar__divider" />

            {/* Width Slider */}
            <div className="doodle-toolbar__group doodle-toolbar__width">
                <span className="doodle-toolbar__width-preview" style={{
                    width: `${Math.max(4, penWidth)}px`,
                    height: `${Math.max(4, penWidth)}px`,
                    backgroundColor: tool === 'pen' ? penColor : 'var(--text-secondary)',
                    borderRadius: '50%',
                }} />
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={penWidth}
                    onChange={(e) => setPenWidth(Number(e.target.value))}
                    className="doodle-toolbar__slider"
                    aria-label="Pen width"
                />
            </div>

            {/* Divider */}
            <div className="doodle-toolbar__divider" />

            {/* Undo / Redo / Clear */}
            <div className="doodle-toolbar__group">
                <ReaderTooltip content="Undo" side="top">
                    <button
                        className="doodle-toolbar__btn"
                        onClick={() => activePageId && undo(activePageId)}
                        disabled={undoStack.length === 0}
                        aria-label="Undo"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 14 4 9 9 4" />
                            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                        </svg>
                    </button>
                </ReaderTooltip>
                <ReaderTooltip content="Redo" side="top">
                    <button
                        className="doodle-toolbar__btn"
                        onClick={() => activePageId && redo(activePageId)}
                        disabled={redoStack.length === 0}
                        aria-label="Redo"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 14 20 9 15 4" />
                            <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                        </svg>
                    </button>
                </ReaderTooltip>
                <ReaderTooltip content="Clear all" side="top">
                    <button
                        className="doodle-toolbar__btn doodle-toolbar__btn--danger"
                        onClick={() => activePageId && clearAll(activePageId)}
                        disabled={strokes.length === 0}
                        aria-label="Clear all drawings"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                </ReaderTooltip>
            </div>

            {/* Divider */}
            <div className="doodle-toolbar__divider" />

            {/* Exit Doodle Mode */}
            <ReaderTooltip content="Exit drawing mode" side="top">
                <button
                    className="doodle-toolbar__btn doodle-toolbar__btn--exit"
                    onClick={() => setDoodleMode(false)}
                    aria-label="Exit drawing mode"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Done</span>
                </button>
            </ReaderTooltip>
        </div>
    );
});
