import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string // 'YYYY-MM-DD'
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function DatePicker({ value, onChange, placeholder = 'Select date...', className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Parse initial selected date or default to today
  const selectedDate = useMemo(() => {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
  }, [value])

  const [viewDate, setViewDate] = useState<Date>(() => selectedDate || new Date())

  // Sync view date when value changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate)
    }
  }, [selectedDate])

  // Compute position relative to viewport
  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const popoverHeight = 320
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= popoverHeight ? rect.bottom + 6 : rect.top - popoverHeight - 6
      const left = Math.min(Math.max(10, rect.left), window.innerWidth - 300)
      setPopoverPos({ top: Math.max(10, top), left })
    }
  }

  useEffect(() => {
    if (open) {
      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
    }
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('pointerdown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [open])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Calendar math
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const calendarDays = useMemo(() => {
    const days: { day: number; monthOffset: number; dateString: string }[] = []

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const pDay = daysInPrevMonth - i
      const pDate = new Date(year, month - 1, pDay)
      const dateStr = formatDate(pDate)
      days.push({ day: pDay, monthOffset: -1, dateString: dateStr })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const cDate = new Date(year, month, d)
      const dateStr = formatDate(cDate)
      days.push({ day: d, monthOffset: 0, dateString: dateStr })
    }

    // Next month padding to complete 42 cells (6 rows)
    const remaining = 42 - days.length
    for (let n = 1; n <= remaining; n++) {
      const nDate = new Date(year, month + 1, n)
      const dateStr = formatDate(nDate)
      days.push({ day: n, monthOffset: 1, dateString: dateStr })
    }

    return days
  }, [year, month, firstDayOfWeek, daysInMonth, daysInPrevMonth])

  function formatDate(d: Date): string {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function handleSelect(e: React.SyntheticEvent, dateStr: string) {
    e.preventDefault()
    e.stopPropagation()
    onChange(dateStr)
    setOpen(false)
  }

  function handlePrevMonth(e: React.SyntheticEvent) {
    e.preventDefault()
    e.stopPropagation()
    setViewDate(new Date(year, month - 1, 1))
  }

  function handleNextMonth(e: React.SyntheticEvent) {
    e.preventDefault()
    e.stopPropagation()
    setViewDate(new Date(year, month + 1, 1))
  }

  function handleClear(e: React.SyntheticEvent) {
    e.preventDefault()
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const todayStr = formatDate(new Date())

  // Display label format (e.g., "08/09/2026")
  const displayLabel = useMemo(() => {
    if (!selectedDate) return ''
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const dd = String(selectedDate.getDate()).padStart(2, '0')
    const yyyy = selectedDate.getFullYear()
    return `${mm}/${dd}/${yyyy}`
  }, [selectedDate])

  return (
    <div ref={containerRef} className="relative inline-block w-full select-none">
      {/* Input Display Button */}
      <div
        onPointerDown={() => setOpen((o) => !o)}
        className={cn(
          'relative flex items-center justify-between w-full h-11 pl-9 pr-8 text-xs font-semibold rounded-xl',
          'border border-border/60 bg-card/80 text-foreground cursor-pointer shadow-xs',
          'hover:bg-accent/60 hover:border-primary/40 transition-all duration-200',
          open && 'ring-2 ring-primary/40 border-primary/50 bg-card',
          className
        )}
      >
        <CalendarIcon className="w-4 h-4 text-primary absolute left-3 pointer-events-none" />
        
        <span className={cn('truncate', !displayLabel && 'text-muted-foreground/70 font-normal')}>
          {displayLabel || placeholder}
        </span>

        {value ? (
          <button
            type="button"
            onPointerDown={handleClear}
            onClick={handleClear}
            className="absolute right-2.5 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="absolute right-3 text-[10px] text-muted-foreground/50">▼</span>
        )}
      </div>

      {/* Floating Portal Calendar Window */}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }}
            className={cn(
              'fixed z-[9999] w-72 p-3.5 rounded-2xl',
              'bg-card text-card-foreground border border-border/80 shadow-2xl',
              'backdrop-blur-2xl animate-in fade-in-50 zoom-in-95 duration-150'
            )}
          >
            {/* Calendar Header: Month Year & Navigation */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold tracking-wide text-foreground">
                {MONTH_NAMES[month]} {year}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onPointerDown={handlePrevMonth}
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onPointerDown={handleNextMonth}
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days of Week Row */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {DAY_NAMES.map((d) => (
                <span key={d} className="text-[10px] font-extrabold uppercase text-muted-foreground/70 py-1">
                  {d}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map(({ day, monthOffset, dateString }) => {
                const isSelected = value === dateString
                const isToday = todayStr === dateString
                const isCurrentMonth = monthOffset === 0

                return (
                  <button
                    type="button"
                    key={dateString}
                    onPointerDown={(e) => handleSelect(e, dateString)}
                    onClick={(e) => handleSelect(e, dateString)}
                    className={cn(
                      'h-8 w-8 mx-auto flex items-center justify-center rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/25 scale-105'
                        : isCurrentMonth
                        ? 'text-foreground hover:bg-primary/15 hover:text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40',
                      isToday && !isSelected && 'ring-1 ring-primary/60 text-primary font-bold'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-[11px]">
              <button
                type="button"
                onPointerDown={(e) => handleSelect(e, todayStr)}
                onClick={(e) => handleSelect(e, todayStr)}
                className="font-bold text-primary hover:underline cursor-pointer"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onPointerDown={handleClear}
                  onClick={handleClear}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
