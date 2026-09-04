import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';

interface FootnotePopoverProps {
  title?: string;
  content: string;
  anchorRect: DOMRect;
  onJump?: () => void;
  onClose: () => void;
}

export function FootnotePopover({
  title = 'Footnote',
  content,
  anchorRect,
  onJump,
  onClose,
}: FootnotePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dismiss on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Compute position relative to viewport
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  const spaceBelow = viewportHeight - anchorRect.bottom;
  const placeAbove = spaceBelow < 220 && anchorRect.top > 220;

  const top = placeAbove
    ? Math.max(16, anchorRect.top - 240)
    : Math.min(viewportHeight - 240, anchorRect.bottom + 8);

  const left = Math.max(
    16,
    Math.min(viewportWidth - 456, anchorRect.left - 20)
  );

  return (
    <div
      ref={popoverRef}
      className="premium-footnote-popover"
      style={{
        top: `${top}px`,
        left: `${left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="premium-footnote-popover-header">
        <span className="premium-footnote-title">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="premium-footnote-btn !p-1 !border-none !bg-transparent opacity-70 hover:opacity-100"
          aria-label="Close footnote"
        >
          <X size={14} />
        </button>
      </div>

      <div
        className="premium-footnote-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      <div className="premium-footnote-actions">
        <button
          type="button"
          onClick={onClose}
          className="premium-footnote-btn"
        >
          Dismiss
        </button>
        {onJump && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onJump();
            }}
            className="premium-footnote-btn premium-footnote-btn--primary flex items-center gap-1"
          >
            <span>Jump to note</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
