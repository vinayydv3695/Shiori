import { useEffect, useState, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// ──────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────

interface ConversionProgressPayload {
  stage: string;
  percent: number;
}

interface ConversionProgressProps {
  /** Show the overlay — controlled by the parent */
  visible: boolean;
  /** Title of the book being converted (for display only) */
  bookTitle?: string;
  /** Called when the conversion finishes (percent === 100) */
  onComplete?: () => void;
  /** Called if the user clicks Cancel */
  onCancel?: () => void;
}

// ──────────────────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────────────────

/**
 * ConversionProgress — full-screen overlay that listens for
 * `conversion-progress` Tauri events and shows a progress bar.
 *
 * Mount this in your reader layout and pass `visible` when the book
 * being opened requires format conversion.
 *
 * @example
 * ```tsx
 * <ConversionProgress
 *   visible={isConverting}
 *   bookTitle={book.title}
 *   onComplete={() => setIsConverting(false)}
 * />
 * ```
 */
export function ConversionProgress({
  visible,
  bookTitle,
  onComplete,
  onCancel,
}: ConversionProgressProps) {
  const [stage, setStage] = useState('Preparing…');
  const [percent, setPercent] = useState(0);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ── Subscribe to Tauri events ──────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setStage('Preparing…');
      setPercent(0);
      return;
    }

    let active = true;

    listen<ConversionProgressPayload>('conversion-progress', (event) => {
      if (!active) return;
      const { stage: s, percent: p } = event.payload;
      setStage(s);
      setPercent(Math.min(100, Math.max(0, p)));
      if (p >= 100) {
        onComplete?.();
      }
    }).then((fn) => {
      unlistenRef.current = fn;
    });

    return () => {
      active = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [visible, onComplete]);

  if (!visible) return null;

  return (
    <div className="conversion-overlay" role="dialog" aria-modal aria-label="Converting book">
      <div className="conversion-card">
        {/* Icon */}
        <div className="conversion-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="var(--primary)" strokeWidth="2" strokeDasharray="6 3" />
            <path
              d="M24 14v10l6 4"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="conversion-title">Converting Book</h2>
        {bookTitle && (
          <p className="conversion-book-title">{bookTitle}</p>
        )}

        {/* Stage label */}
        <p className="conversion-stage">{stage}</p>

        {/* Progress bar */}
        <div className="conversion-bar-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="conversion-bar-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="conversion-percent">{percent}%</span>

        {/* Cancel */}
        {onCancel && percent < 100 && (
          <button className="conversion-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <style>{`
        .conversion-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: hsl(var(--background) / 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: cvFadeIn 200ms ease;
        }
        @keyframes cvFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .conversion-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 40px 48px;
          width: min(480px, 90vw);
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 16px;
          box-shadow: 0 24px 64px hsl(var(--shadow, 0 0% 0%) / 0.4);
          animation: cvSlideUp 250ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cvSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .conversion-icon {
          animation: cvSpin 3s linear infinite;
        }
        @keyframes cvSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .conversion-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: hsl(var(--foreground));
          text-align: center;
        }
        .conversion-book-title {
          margin: 0;
          font-size: 13px;
          color: hsl(var(--muted-foreground));
          text-align: center;
          max-width: 320px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .conversion-stage {
          margin: 0;
          font-size: 13px;
          color: hsl(var(--primary));
          font-weight: 500;
          min-height: 20px;
        }
        .conversion-bar-track {
          width: 100%;
          height: 6px;
          background: hsl(var(--muted));
          border-radius: 99px;
          overflow: hidden;
        }
        .conversion-bar-fill {
          height: 100%;
          border-radius: 99px;
          background: hsl(var(--primary));
          transition: width 300ms ease;
        }
        .conversion-percent {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          font-variant-numeric: tabular-nums;
        }
        .conversion-cancel-btn {
          margin-top: 4px;
          padding: 6px 18px;
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          background: transparent;
          color: hsl(var(--muted-foreground));
          font-size: 13px;
          cursor: pointer;
          transition: background 150ms, color 150ms;
        }
        .conversion-cancel-btn:hover {
          background: hsl(var(--destructive) / 0.08);
          color: hsl(var(--destructive));
          border-color: hsl(var(--destructive) / 0.4);
        }
      `}</style>
    </div>
  );
}

export default ConversionProgress;
