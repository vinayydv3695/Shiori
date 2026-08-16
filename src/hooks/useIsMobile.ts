import { useMediaQuery } from './useMediaQuery'
import { isAndroid } from '@/lib/tauri'

export function useIsMobile(breakpoint: string = '(max-width: 767px)'): boolean {
  const matches = useMediaQuery(breakpoint)
  return isAndroid || matches
}

export function useIsTablet(breakpoint: string = '(max-width: 1023px)'): boolean {
  return useMediaQuery(breakpoint)
}

