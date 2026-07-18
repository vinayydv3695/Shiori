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
        <div className={cn('flex items-center gap-1.5', className)}>
            <div 
                className="rounded-md overflow-hidden bg-white/5 flex items-center justify-center border border-border/50 shadow-sm"
                style={{ width: size, height: size }}
            >
                <img 
                    src={`${import.meta.env.BASE_URL}logo.png`} 
                    alt="Shiori Logo" 
                    className="w-full h-full object-contain p-[2px]" 
                />
            </div>
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} className={cn(className)} {...props}>
            <rect width="256" height="256" fill="none" />
            <path d="M160,56a32,32,0,0,0-32,32A32,32,0,0,0,96,56H24V200H96a32,32,0,0,1,32,32,32,32,0,0,1,32-32h72V56Z" fill="#3b82f6" />
            <path d="M128,88a32,32,0,0,1,32-32h72V200H160a32,32,0,0,0-32,32" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
            <path d="M24,200H96a32,32,0,0,1,32,32V88A32,32,0,0,0,96,56H24Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// MANGA (comic domain)
// ──────────────────────────────────────────────
export function IconManga({ size = 20, className, ...props }: IconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 48 48" className={cn(className)} {...props}>
            <path fill="currentColor" d="M42.517 39.253A23.9 23.9 0 0 0 48 23.984c0-13.254-10.746-24-24-24s-24 10.746-24 24a23.9 23.9 0 0 0 5.483 15.27h37.034Z"/>
            <path fill="#ff6740" d="M5.483 39.253a24 24 0 0 0 2.022 2.163H40.5a24 24 0 0 0 2.021-2.163zm7.908 6.263H34.61a24 24 0 0 0 3.562-2.162H9.83a24 24 0 0 0 3.562 2.162Z"/>
            <path fill="hsl(var(--background))" d="M36.697 27.006a11 11 0 0 1-2.34-2.84l-.016-.032a10.9 10.9 0 0 1-1.332-3.978c-.008-.086-.02-.172-.027-.26v-.015a2.8 2.8 0 0 0-.603-1.34 2 2 0 0 0-.093-.1 19.28 19.28 0 0 0-9.8-5.911 12.15 12.15 0 0 1 1.499-6.436.699.699 0 0 0-.78-1.013A25.47 25.47 0 0 0 5.189 17.795a23 23 0 0 0-3.18-1.412c-.23-.082-.463-.157-.696-.233a24.05 24.05 0 0 0 2.51 20.834H31.01a2.81 2.81 0 0 0 2.666-1.94 2.8 2.8 0 0 1 .976-1.494h.005q.052-.044.108-.081c.05-.039.1-.07.151-.103a5.51 5.51 0 0 0 2.218-4.428 5.5 5.5 0 0 0-.31-1.826c-.046-.039-.087-.07-.127-.106m-6.322-2.05a.7.7 0 0 1-.324-.081 3.76 3.76 0 0 0-1.894-.506 3.9 3.9 0 0 0-1.835.47c-.005 0-.01.008-.016.01a.3.3 0 0 0-.059.035.68.68 0 0 1-.616-1.213 5.16 5.16 0 0 1 2.526-.656 5.1 5.1 0 0 1 2.267.524q.133.06.261.135l.068.041a.678.678 0 0 1-.375 1.242z"/>
            <path fill="#ff6740" d="M5.258 17.676c1.304 6.245 6.718 10.93 13.21 10.93 3.822 0 7.27-1.625 9.727-4.235h-.04a3.9 3.9 0 0 0-1.835.47c-.004 0-.01.008-.016.01a.3.3 0 0 0-.059.035.68.68 0 0 1-.616-1.213 5.16 5.16 0 0 1 3.608-.544 13.9 13.9 0 0 0 2.42-5.356 19.25 19.25 0 0 0-9.167-5.239 12.15 12.15 0 0 1 1.496-6.44.699.699 0 0 0-.781-1.013A25.47 25.47 0 0 0 5.258 17.676"/>
            <path fill="currentColor" d="M33.236 30.59a22 22 0 0 0-1.752-.518c-.59-.142-1.18-.296-1.776-.412a25.6 25.6 0 0 0-3.602-.482c-.302-.026-.605-.035-.907-.049a10 10 0 0 0-.908 0c-.303.013-.605.022-.908.035l-.452.036a8 8 0 0 0-.453.042 17.4 17.4 0 0 0-3.558.75l-.006-.018a15.2 15.2 0 0 1 3.547-.882c.302-.045.607-.065.91-.094.305-.03.61-.04.916-.043q.458-.005.916-.005c.305.001.61.018.915.04 1.219.084 2.43.26 3.621.527q.896.198 1.773.46c.585.174 1.165.367 1.732.596zm-.529 1.11a24 24 0 0 0-1.81-.252c-.605-.058-1.21-.117-1.817-.144a25.6 25.6 0 0 0-3.634.058c-.302.02-.603.056-.904.087q-.452.047-.9.13a67 67 0 0 0-.89.17l-.442.103c-.15.03-.296.07-.442.107q-.882.225-1.732.549-.856.32-1.675.727l-.012-.014a15.3 15.3 0 0 1 3.375-1.4c.292-.09.59-.154.887-.229.299-.06.596-.13.898-.178q.453-.072.905-.14c.303-.047.606-.074.91-.094a24 24 0 0 1 3.657-.018q.915.063 1.822.187c.603.086 1.205.188 1.8.333zm-.082 1.293c-.61.026-1.219.07-1.822.144-.602.074-1.207.146-1.805.251-1.197.197-2.379.48-3.536.844-.291.084-.576.188-.864.281s-.57.206-.844.323c-.273.117-.562.236-.835.357l-.409.196q-.207.095-.408.2a16 16 0 0 0-1.573.91q-.766.497-1.477 1.071l-.012-.014a15.2 15.2 0 0 1 2.991-2.099c.267-.15.544-.281.817-.415q.41-.2.838-.369.425-.17.854-.331.43-.16.868-.291a24 24 0 0 1 3.57-.807q.905-.135 1.82-.206a20 20 0 0 1 1.83-.064z"/>
            <path fill="#ff7bac" d="M36.697 27.006q-.305-.267-.591-.554a1.788 1.788 0 0 0 .925 3.32h.027c.012-.075.029-.148.037-.225a5.46 5.46 0 0 0-.276-2.437c-.04-.037-.082-.069-.122-.104"/>
            <path fill="hsl(var(--background))" d="M21.87 13.455v.254a19.2 19.2 0 0 0-5.85 3.729 10.27 10.27 0 0 1 8.032-11.514 14 14 0 0 0-2.182 7.531"/>
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
            <rect x="3" y="3" width="18" height="4" rx="1" />
            <rect x="3" y="9" width="18" height="12" rx="1" />
            <path d="M8 14h8" />
            <path d="M10 18h4" />
        </svg>
    )
}

// ──────────────────────────────────────────────
// INFO (book details / information)
// ──────────────────────────────────────────────
export function IconInfo({ size = 20, className, ...props }: IconProps) {
    return (
        <svg {...baseProps(size)} className={cn(className)} {...props}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    )
}
