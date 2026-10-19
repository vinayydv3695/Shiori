import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BottomNav } from '@/components/layout/BottomNav'

// Mock preferencesStore
vi.mock('@/store/preferencesStore', () => ({
  usePreferencesStore: vi.fn((selector) =>
    selector({
      preferences: {
        preferredContentType: 'books',
      },
    })
  ),
}))

describe('BottomNav Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders all 4 navigation tabs with accessible labels', () => {
    render(
      <BottomNav
        currentView="home"
        onNavigateToView={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('invokes onNavigateToView when a tab is clicked', () => {
    const handleNavigate = vi.fn()
    render(
      <BottomNav
        currentView="home"
        onNavigateToView={handleNavigate}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(handleNavigate).toHaveBeenCalledWith('library')

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(handleNavigate).toHaveBeenCalledWith('online-books')

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(handleNavigate).toHaveBeenCalledWith('more')
  })

  it('auto-hides after 3.5 seconds of user inactivity and notifies onVisibilityChange', () => {
    const handleVisibilityChange = vi.fn()
    render(
      <BottomNav
        currentView="home"
        onNavigateToView={vi.fn()}
        onVisibilityChange={handleVisibilityChange}
      />
    )

    expect(handleVisibilityChange).toHaveBeenCalledWith(true)

    // Fast-forward past the 3500ms inactivity threshold
    act(() => {
      vi.advanceTimersByTime(3600)
    })

    expect(handleVisibilityChange).toHaveBeenCalledWith(false)
  })

  it('wakes up and becomes visible again when user clicks/taps the screen', () => {
    const handleVisibilityChange = vi.fn()
    render(
      <BottomNav
        currentView="home"
        onNavigateToView={vi.fn()}
        onVisibilityChange={handleVisibilityChange}
      />
    )

    // Let it hide
    act(() => {
      vi.advanceTimersByTime(3600)
    })
    expect(handleVisibilityChange).toHaveBeenLastCalledWith(false)

    // User taps on the screen
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    expect(handleVisibilityChange).toHaveBeenLastCalledWith(true)
  })
})
