type LenisLike = {
  scrollTo: (target: HTMLElement | number | string, options?: { offset?: number }) => void
}

let current: LenisLike | null = null

export function bindCitadelLenis(next: LenisLike | null) {
  current = next
}

export function scrollCitadelTo(el: HTMLElement): boolean {
  if (!current) return false
  current.scrollTo(el, { offset: 0 })
  return true
}
