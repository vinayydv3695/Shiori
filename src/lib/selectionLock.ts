/**
 * Helper to check if text selection, note input, options toolbar, translation/dictionary popup,
 * annotation tooltip, or any modal dialog is active.
 * When active (especially on Android / mobile touch screens), reader swipe gestures, page turns,
 * edge taps, and hold-to-scroll MUST be locked to prevent touches/swipes from accidentally turning pages
 * or navigating away from the current reading position.
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

  // 3. Check if text selection toolbar, translation popup, dictionary, note input, or any modal is rendered
  try {
    if (
      document.querySelector('.text-selection-toolbar') ||
      document.querySelector('.translation-popup') ||
      document.querySelector('.reader-annotation-tooltip') ||
      document.querySelector('.text-selection-category-menu') ||
      document.querySelector('.text-selection-toolbar-note') ||
      document.querySelector('.note-dialog') ||
      document.querySelector('.annotation-modal') ||
      document.querySelector('.text-selection-toolbar--card') ||
      document.querySelector('.text-selection-toolbar--pill') ||
      document.querySelector('[role="dialog"]') ||
      document.querySelector('[role="menu"]') ||
      document.querySelector('[role="popover"]') ||
      document.querySelector('.quote-card-dialog') ||
      document.querySelector('.annotation-export-dialog') ||
      document.querySelector('.doodle-toolbar')
    ) {
      return true;
    }
  } catch {
    // Ignore query errors
  }

  // 4. Check if document's active focus element is a text input, textarea, or contentEditable
  const activeEl = document.activeElement;
  if (activeEl) {
    const tagName = activeEl.tagName.toLowerCase();
    if (tagName === 'textarea' || tagName === 'input' || tagName === 'select') {
      return true;
    }
    if ((activeEl as HTMLElement).isContentEditable) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a touch event target is inside a selection toolbar, note dialog, translation popup,
 * input, button, or modal.
 */
export function isTouchOnSelectionOrModal(target: Element | null): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest('.text-selection-toolbar') ||
    target.closest('.translation-popup') ||
    target.closest('.reader-annotation-tooltip') ||
    target.closest('.text-selection-category-menu') ||
    target.closest('.text-selection-toolbar-note') ||
    target.closest('.note-dialog') ||
    target.closest('.annotation-modal') ||
    target.closest('.text-selection-toolbar--card') ||
    target.closest('.text-selection-toolbar--pill') ||
    target.closest('textarea') ||
    target.closest('input') ||
    target.closest('button') ||
    target.closest('a') ||
    target.closest('select') ||
    target.closest('[role="dialog"]') ||
    target.closest('[role="menu"]') ||
    target.closest('[role="popover"]') ||
    target.closest('[role="button"]') ||
    target.closest('.quote-card-dialog') ||
    target.closest('.annotation-export-dialog') ||
    target.closest('.premium-top-bar') ||
    target.closest('.premium-sidebar') ||
    target.closest('.doodle-toolbar') ||
    target.closest('mark.epub-highlight') ||
    target.closest('mark.pdf-highlight') ||
    target.closest('[data-note-content]') ||
    target.closest('[data-annotation-id]')
  );
}
