import type { CurrentView } from "@/store/uiStore"
import { useIsMobile, useIsTablet } from "@/hooks/useIsMobile"
import { NavigationRailDesktop } from "./NavigationRailDesktop"

interface NavigationRailProps {
  currentView: CurrentView
  onNavigateToView?: (view: CurrentView) => void
}

export function NavigationRail(props: NavigationRailProps) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const hideRail = isMobile || isTablet

  if (hideRail) {
    // Navigation is handled by BottomNav on small screens
    return null
  }

  return <NavigationRailDesktop {...props} />
}
