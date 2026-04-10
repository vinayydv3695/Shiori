import { type ReactNode, useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface HomeSectionProps {
    icon: ReactNode
    title: string
    action?: { label: string; onClick: () => void }
    children: ReactNode
    sectionType?: 'continue' | 'favorites' | 'completed' | 'on-hold' | 'history' | 'recent'
}

export function HomeSection({ icon, title, action, children, sectionType }: HomeSectionProps) {
    return (
        <section className="home-section" aria-label={title} data-section-type={sectionType}>
            <div className="home-section-header">
                <h2 className="home-section-title">
                    <span className="home-section-title-icon">{icon}</span>
                    {title}
                </h2>
                {action && (
                    <button
                        type="button"
                        className="home-section-action"
                        onClick={action.onClick}
                    >
                        {action.label} →
                    </button>
                )}
            </div>
            {children}
        </section>
    )
}

interface ScrollStripProps {
    children: ReactNode
}

export function ScrollStrip({ children }: ScrollStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ atStart: true, atEnd: false })

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        
        const atStart = el.scrollLeft <= 10
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10
        
        setScrollState({ atStart, atEnd })
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        
        updateScrollState()
        el.addEventListener('scroll', updateScrollState, { passive: true })
        
        // Also update on resize
        const resizeObserver = new ResizeObserver(updateScrollState)
        resizeObserver.observe(el)
        
        return () => {
            el.removeEventListener('scroll', updateScrollState)
            resizeObserver.disconnect()
        }
    }, [updateScrollState])

    const scroll = (direction: 'left' | 'right') => {
        const el = scrollRef.current
        if (!el) return
        
        const cardWidth = 180 // Approximate card width + gap
        const scrollAmount = cardWidth * 3 // Scroll 3 cards at a time
        
        el.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        })
    }

    return (
        <div 
            className="scroll-strip-wrapper"
            data-scroll-start={scrollState.atStart}
            data-scroll-end={scrollState.atEnd}
        >
            <button
                type="button"
                className="scroll-nav-btn prev"
                onClick={() => scroll('left')}
                disabled={scrollState.atStart}
                aria-label="Scroll left"
            >
                <ChevronLeft size={20} />
            </button>
            
            <div ref={scrollRef} className="scroll-strip">
                {children}
            </div>
            
            <button
                type="button"
                className="scroll-nav-btn next"
                onClick={() => scroll('right')}
                disabled={scrollState.atEnd}
                aria-label="Scroll right"
            >
                <ChevronRight size={20} />
            </button>
        </div>
    )
}
