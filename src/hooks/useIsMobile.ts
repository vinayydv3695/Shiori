import { useMediaQuery } from './useMediaQuery'

export function useIsMobile(breakpoint: string = '(max-width: 767px)'): boolean {
  return useMediaQuery(breakpoint)
}

export function useIsTablet(breakpoint: string = '(max-width: 1023px)'): boolean {
  return useMediaQuery(breakpoint)
}
