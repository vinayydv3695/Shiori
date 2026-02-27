import { create } from 'zustand';

// ────────────────────────────────────────────────────────────
// DOODLE STROKE TYPES
// ────────────────────────────────────────────────────────────

export interface DoodleStroke {
    id: string;
    tool: 'pen' | 'eraser';
    color: string;
    width: number;
    points: [number, number, number][]; // [x%, y%, pressure]
    timestamp: number;
}

export type DoodleAction =
    | { type: 'addStroke'; stroke: DoodleStroke }
    | { type: 'removeStroke'; strokeId: string; stroke: DoodleStroke }
    | { type: 'clearAll'; strokes: DoodleStroke[] };

// ────────────────────────────────────────────────────────────
// DOODLE UI STATE (ephemeral, not persisted)
// ────────────────────────────────────────────────────────────

interface DoodleState {
    // Mode
    isDoodleMode: boolean;

    // Tool settings
    tool: 'pen' | 'eraser';
    penColor: string;
    penWidth: number;

    // Strokes for current page
    strokes: DoodleStroke[];

    // Undo/Redo stacks
    undoStack: DoodleAction[];
    redoStack: DoodleAction[];

    // Dirty flag for debounced save
    isDirty: boolean;

    // Actions
    toggleDoodleMode: () => void;
    setDoodleMode: (active: boolean) => void;
    setTool: (tool: 'pen' | 'eraser') => void;
    setPenColor: (color: string) => void;
    setPenWidth: (width: number) => void;

    // Stroke operations
    addStroke: (stroke: DoodleStroke) => void;
    undo: () => void;
    redo: () => void;
    clearAll: () => void;

    // Page lifecycle
    loadStrokes: (strokes: DoodleStroke[]) => void;
    resetPage: () => void;
    markClean: () => void;
}

const MAX_UNDO_STACK = 50;
const MAX_STROKES_PER_PAGE = 500;

export const useDoodleStore = create<DoodleState>((set, get) => ({
    isDoodleMode: false,
    tool: 'pen',
    penColor: '#1A1A2E',
    penWidth: 3,
    strokes: [],
    undoStack: [],
    redoStack: [],
    isDirty: false,

    toggleDoodleMode: () => set((state) => ({
        isDoodleMode: !state.isDoodleMode,
        // Reset tool when entering doodle mode
        ...(state.isDoodleMode ? {} : { tool: 'pen' as const }),
    })),

    setDoodleMode: (active) => set({ isDoodleMode: active }),

    setTool: (tool) => set({ tool }),

    setPenColor: (color) => set({ penColor: color }),

    setPenWidth: (width) => set({ penWidth: Math.max(1, Math.min(20, width)) }),

    addStroke: (stroke) => set((state) => {
        let newStrokes = [...state.strokes, stroke];

        // Enforce max strokes per page
        if (newStrokes.length > MAX_STROKES_PER_PAGE) {
            newStrokes = newStrokes.slice(newStrokes.length - MAX_STROKES_PER_PAGE);
        }

        const action: DoodleAction = { type: 'addStroke', stroke };
        let newUndoStack = [...state.undoStack, action];
        if (newUndoStack.length > MAX_UNDO_STACK) {
            newUndoStack = newUndoStack.slice(1);
        }

        return {
            strokes: newStrokes,
            undoStack: newUndoStack,
            redoStack: [], // Clear redo on new action
            isDirty: true,
        };
    }),

    undo: () => set((state) => {
        if (state.undoStack.length === 0) return state;

        const action = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);

        let newStrokes = [...state.strokes];
        let redoAction: DoodleAction;

        switch (action.type) {
            case 'addStroke':
                newStrokes = newStrokes.filter((s) => s.id !== action.stroke.id);
                redoAction = action;
                break;
            case 'removeStroke':
                newStrokes.push(action.stroke);
                redoAction = action;
                break;
            case 'clearAll':
                newStrokes = action.strokes;
                redoAction = action;
                break;
        }

        return {
            strokes: newStrokes,
            undoStack: newUndoStack,
            redoStack: [...state.redoStack, redoAction!],
            isDirty: true,
        };
    }),

    redo: () => set((state) => {
        if (state.redoStack.length === 0) return state;

        const action = state.redoStack[state.redoStack.length - 1];
        const newRedoStack = state.redoStack.slice(0, -1);

        let newStrokes = [...state.strokes];

        switch (action.type) {
            case 'addStroke':
                newStrokes.push(action.stroke);
                break;
            case 'removeStroke':
                newStrokes = newStrokes.filter((s) => s.id !== action.stroke.id);
                break;
            case 'clearAll':
                newStrokes = [];
                break;
        }

        return {
            strokes: newStrokes,
            undoStack: [...state.undoStack, action],
            redoStack: newRedoStack,
            isDirty: true,
        };
    }),

    clearAll: () => set((state) => {
        if (state.strokes.length === 0) return state;

        const action: DoodleAction = { type: 'clearAll', strokes: [...state.strokes] };
        let newUndoStack = [...state.undoStack, action];
        if (newUndoStack.length > MAX_UNDO_STACK) {
            newUndoStack = newUndoStack.slice(1);
        }

        return {
            strokes: [],
            undoStack: newUndoStack,
            redoStack: [],
            isDirty: true,
        };
    }),

    loadStrokes: (strokes) => set({
        strokes,
        undoStack: [],
        redoStack: [],
        isDirty: false,
    }),

    resetPage: () => set({
        strokes: [],
        undoStack: [],
        redoStack: [],
        isDirty: false,
    }),

    markClean: () => set({ isDirty: false }),
}));
