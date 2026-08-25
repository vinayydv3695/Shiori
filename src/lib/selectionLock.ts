/**
 * Helper to check if text selection, note input, options toolbar, or an annotation dialog is active.
 * When active (especially on Android / mobile touch screens), reader swipe gestures, page turns,
 * and top-bar toggles MUST be locked to prevent touches/swipes from accidentally turning pages
 * or dismissing the note/selection.
 */
export function isSelectionOrNoteActive(): boolean {
  if (typeof document === 'undefined') return false;

  // 1. Check window selection
  try {
    const winSel = window.getSelection();
    if (winSel && !winSel.isCollapsed && winSel.toString().trim().length > 0) {
      return true;
    }
  } catch {
    // Ignore selection read errors
  }

  // 2. Check iframe selections (e.g. EPUB / HTML reader iframe)
  try {
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const frameSel = iframes[i].contentWindow?.getSelection();
        if (frameSel && !frameSel.isCollapsed && frameSel.toString().trim().length > 0) {
          return true;
        }
      } catch {
        // Cross-origin iframe fallback
      }
    }
  } catch {
    // Ignore iframe query errors
  }

  // 3. Check if text selection toolbar, note input, note modal, or annotation popup is rendered
  if (
    document.querySelector('.text-selection-toolbar') ||
    document.querySelector('.note-dialog') ||
    document.querySelector('.annotation-modal') ||
    document.querySelector('.text-selection-toolbar--card') ||
    document.querySelector('.text-selection-toolbar--pill')
  ) {
    return true;
  }

  // 4. Check if document's active focus element is a text input, textarea, or contentEditable
  const activeEl = document.activeElement;
  if (activeEl) {
    const tagName = activeEl.tagName.toLowerCase();
    if (tagName === 'textarea' || tagName === 'input') {
      return true;
    }
    if ((activeEl as HTMLElement).isContentEditable) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a touch event target is inside a selection toolbar, note dialog, input, button, or modal.
 */
export function isTouchOnSelectionOrModal(target: Element | null): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest('.text-selection-toolbar') ||
    target.closest('.note-dialog') ||
    target.closest('.annotation-modal') ||
    target.closest('textarea') ||
    target.closest('input') ||
    target.closest('[role="dialog"]')
  );
}
