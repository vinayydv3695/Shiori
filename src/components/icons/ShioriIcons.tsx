/**
 * Shiori Custom SVG Icon System
 * 2px stroke, 24×24 viewBox, currentColor, rounded line caps
 * Lucide-style minimal — designed for the Shiori design language
 */

import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

type IconProps = SVGProps<SVGSVGElement> & { size?: number; className?: string }

const baseProps = (size: number) => ({
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
})

// ──────────────────────────────────────────────
// SHIORI LOGO MARK
// Geometric bookmark shape — minimalist, flat, modern
// ──────────────────────────────────────────────
export function ShioriMark({ size = 24, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            {/* Bookmark body */}
            <path d="M5 3h14a1 1 0 0 1 1 1v16.5l-8-4-8 4V4a1 1 0 0 1 1-1z" fill="currentColor" stroke="none" />
            {/* Inner accent cut */}
            <path d="M9 3v8l3-2 3 2V3" fill="none" stroke="hsl(var(--background))" strokeWidth="1.5" />
        </svg>
    )
}

// Full wordmark for topbar
export function ShioriWordmark({ size = 20, className }: { size?: number; className?: string }) {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <ShioriMark size={size} />
            <span
                style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    fontSize: size * 0.9,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                }}
            >
                Shiori
            </span>
        </div>
    )
}

// ──────────────────────────────────────────────
// LIBRARY
// ──────────────────────────────────────────────
export function IconLibrary({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <rect x="2" y="4" width="5" height="16" rx="1" />
            <rect x="9" y="4" width="5" height="16" rx="1" />
            <path d="M16 4.5l4-0.5a1 1 0 0 1 1 .93l.9 14.1a1 1 0 0 1-.93 1.07L16 20.5V4.5z" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// BOOKS (ebook domain)
// ──────────────────────────────────────────────
export function IconBooks({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M4 19V5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 0 2 2" />
            <path d="M16 8H9" />
            <path d="M14 12H9" />
            <path d="M4 19a2 2 0 0 0 2 2h11" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// MANGA (comic domain)
// ──────────────────────────────────────────────
export function IconManga({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            {/* Panel grid — 4 panels like a manga page */}
            <rect x="3" y="3" width="8" height="11" rx="1" />
            <rect x="13" y="3" width="8" height="5" rx="1" />
            <rect x="13" y="10" width="8" height="4" rx="1" />
            <rect x="3" y="16" width="18" height="5" rx="1" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// IMPORT BOOK
// ──────────────────────────────────────────────
export function IconImportBook({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M12 3v10M8 9l4 4 4-4" />
            <path d="M5 17h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// IMPORT MANGA
// ──────────────────────────────────────────────
export function IconImportManga({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            {/* Mini panel + down arrow */}
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="12" y="3" width="9" height="4" rx="1" />
            <rect x="12" y="9" width="9" height="3" rx="1" />
            <path d="M7 16v5M4.5 18.5L7 21l2.5-2.5" />
            <path d="M13 21h8" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// RSS
// ──────────────────────────────────────────────
export function IconRSS({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" fill="currentColor" stroke="none" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// CONVERT
// ──────────────────────────────────────────────
export function IconConvert({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <path d="m9 11 3-3 3 3" />
            <path d="m15 13-3 3-3-3" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// EDIT METADATA
// ──────────────────────────────────────────────
export function IconEditMeta({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            <path d="M9 7h1M9 11h4M9 15h2" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────
export function IconDelete({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────
export function IconSettings({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// SEARCH
// ──────────────────────────────────────────────
export function IconSearch({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// SUN (light theme)
// ──────────────────────────────────────────────
export function IconSun({ size = 18, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// MOON (dark theme)
// ──────────────────────────────────────────────
export function IconMoon({ size = 18, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// CHEVRON DOWN
// ──────────────────────────────────────────────
export function IconChevronDown({ size = 16, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// CHECK (selection)
// ──────────────────────────────────────────────
export function IconCheck({ size = 14, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// BOOK OPEN (read action / empty state)
// ──────────────────────────────────────────────
export function IconBookOpen({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// PLUS (add / import shorthand)
// ──────────────────────────────────────────────
export function IconPlus({ size = 18, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// SIDEBAR TOGGLE
// ──────────────────────────────────────────────
export function IconSidebarToggle({ size = 18, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="M14 9l-3 3 3 3" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// FILTER
// ──────────────────────────────────────────────
export function IconFilter({ size = 16, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// X (close / clear)
// ──────────────────────────────────────────────
export function IconX({ size = 16, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// STAR (rating)
// ──────────────────────────────────────────────
export function IconStar({ size = 14, className, filled = false, ...props }: IconProps & { filled?: boolean }) {
    return (
        <svg {...baseProps(size)} className={cn(className)} fill={filled ? 'currentColor' : 'none'} {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// SHARE
// ──────────────────────────────────────────────
export function IconShare({ size = 16, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// COLLECTION
// ──────────────────────────────────────────────
export function IconCollection({ size = 16, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V5z" />
            <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            <path d="M7 11h4M7 15h6" />
        </svg>
    )
}
