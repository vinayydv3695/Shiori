import type { SVGProps } from 'react';

export function BookshelfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      {...props}
    >
      {/* Horizontal shelf base ledge */}
      <path d="M3 20h18" />
      {/* Book 1 (standing upright) */}
      <path d="M5 20V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14" />
      {/* Book 2 (tall volume with bookmark band) */}
      <path d="M9 20V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16" />
      {/* Book 3 (leaning book) */}
      <path d="M14 20l3.3-14.4a1 1 0 0 1 1.2-.7l1.4.3a1 1 0 0 1 .7 1.2L17.3 20" />
    </svg>
  );
}
