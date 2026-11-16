import React from 'react';
import { type CollectorFrameStyle, useReadingSettings } from '@/store/premiumReaderStore';

interface ReaderFolioFrameProps {
  style?: CollectorFrameStyle;
}

export const ReaderFolioFrame: React.FC<ReaderFolioFrameProps> = ({ style: propStyle }) => {
  const storeStyle = useReadingSettings((s) => s.collectorFrame);
  const theme = useReadingSettings((s) => s.theme);
  const activeStyle = propStyle ?? storeStyle;

  if (activeStyle === 'none') {
    return null;
  }

  return (
    <div
      className={`reader-folio-frame reader-folio-frame--${activeStyle} theme-${theme} pointer-events-none select-none`}
      aria-hidden="true"
    >
      {activeStyle === 'victorian' && (
        <>
          {/* Top-Left Filigree Flourish */}
          <svg className="reader-folio-flourish reader-folio-flourish--tl" viewBox="0 0 48 48" fill="none">
            <path
              d="M4 44V12C4 7.58172 7.58172 4 12 4H44"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 40V16C8 11.5817 11.5817 8 16 8H40"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeOpacity="0.6"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <path
              d="M20 4C20 8.41828 16.4183 12 12 12C7.58172 12 4 15.5817 4 20"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Top-Right Filigree Flourish */}
          <svg className="reader-folio-flourish reader-folio-flourish--tr" viewBox="0 0 48 48" fill="none">
            <path
              d="M44 44V12C44 7.58172 40.4183 4 36 4H4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M40 40V16C40 11.5817 36.4183 8 32 8H8"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeOpacity="0.6"
            />
            <circle cx="36" cy="12" r="3" stroke="currentColor" strokeWidth="1" />
            <circle cx="36" cy="12" r="1" fill="currentColor" />
            <path
              d="M28 4C28 8.41828 31.5817 12 36 12C40.4183 12 44 15.5817 44 20"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Bottom-Left Filigree Flourish */}
          <svg className="reader-folio-flourish reader-folio-flourish--bl" viewBox="0 0 48 48" fill="none">
            <path
              d="M4 4V36C4 40.4183 7.58172 44 12 44H44"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 8V32C8 36.4183 11.5817 40 16 40H40"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeOpacity="0.6"
            />
            <circle cx="12" cy="36" r="3" stroke="currentColor" strokeWidth="1" />
            <circle cx="12" cy="36" r="1" fill="currentColor" />
            <path
              d="M20 44C20 39.5817 16.4183 36 12 36C7.58172 36 4 32.4183 4 28"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Bottom-Right Filigree Flourish */}
          <svg className="reader-folio-flourish reader-folio-flourish--br" viewBox="0 0 48 48" fill="none">
            <path
              d="M44 4V36C44 40.4183 40.4183 44 36 44H4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M40 8V32C40 36.4183 36.4183 40 32 40H8"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeOpacity="0.6"
            />
            <circle cx="36" cy="36" r="3" stroke="currentColor" strokeWidth="1" />
            <circle cx="36" cy="36" r="1" fill="currentColor" />
            <path
              d="M28 44C28 39.5817 31.5817 36 36 36C40.4183 36 44 32.4183 44 28"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>

          <div className="reader-folio-inner-rule" />
        </>
      )}

      {activeStyle === 'minimal' && (
        <>
          <div className="reader-folio-minimal-corner reader-folio-minimal-corner--tl" />
          <div className="reader-folio-minimal-corner reader-folio-minimal-corner--tr" />
          <div className="reader-folio-minimal-corner reader-folio-minimal-corner--bl" />
          <div className="reader-folio-minimal-corner reader-folio-minimal-corner--br" />
          <div className="reader-folio-minimal-axis" />
        </>
      )}

      {activeStyle === 'deboss' && (
        <div className="reader-folio-deboss-well" />
      )}
    </div>
  );
};
