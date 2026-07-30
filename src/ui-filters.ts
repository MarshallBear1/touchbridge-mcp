import type { UIElement } from './types.js'

const INTERACTIVE_TYPES = new Set([
  'Button', 'Link', 'TextField', 'SecureTextField', 'TextView',
  'SearchField', 'Switch', 'TabBar', 'Icon', 'Cell',
  'Slider', 'Toggle', 'Picker', 'SegmentedControl', 'Stepper',
  'MenuItem', 'MenuBarItem', 'Tab',
])

export function filterUnlabeledOther(elements: UIElement[]): UIElement[] {
  return elements.filter(el =>
    el.type !== 'Other' || Boolean(el.AXLabel || el.label || el.title || el.name)
  )
}

export function filterVisibleCoords(
  elements: UIElement[],
  screenWidth: number,
  screenHeight: number,
): UIElement[] {
  return elements.filter(el => {
    const f = el.frame
    if (!f) return false
    const cx = f.x + f.width / 2
    const cy = f.y + f.height / 2
    return cx >= 0 && cx <= screenWidth && cy >= 0 && cy <= screenHeight
  })
}

export function filterInteractiveTypes(elements: UIElement[]): UIElement[] {
  return elements.filter(el => el.type && INTERACTIVE_TYPES.has(el.type))
}

export function dedup(elements: UIElement[]): UIElement[] {
  const seen = new Set<string>()
  return elements.filter(el => {
    const label = el.AXLabel ?? el.label ?? el.title ?? ''
    const f = el.frame
    const key = `${el.type}|${label}|${f?.x},${f?.y},${f?.width},${f?.height}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function elementMatchesQuery(el: UIElement, re: RegExp): boolean {
  const fields = [el.AXLabel, el.label, el.title, el.name, el.AXValue, el.value]
  for (const f of fields) {
    if (f && re.test(f as string)) return true
  }
  return false
}

function grepElements(elements: UIElement[], query: string): UIElement[] {
  const re = new RegExp(escapeRegex(query), 'i')
  return elements.filter(el => elementMatchesQuery(el, re))
}

export interface ScanResult {
  elements: UIElement[]
  warning?: string
}

export function applyScanUiFilters(
  rawElements: UIElement[],
  screenWidth: number,
  screenHeight: number,
  query?: string,
): ScanResult {
  const base = dedup(filterUnlabeledOther(rawElements))
  const visible = filterVisibleCoords(base, screenWidth, screenHeight)
  const interactive = filterInteractiveTypes(base)
  const visibleInteractive = filterInteractiveTypes(visible)

  if (!query) {
    return { elements: visibleInteractive }
  }

  const p1 = grepElements(visibleInteractive, query)
  if (p1.length > 0) return { elements: p1 }

  const p2 = grepElements(interactive, query)
  if (p2.length > 0) {
    return {
      elements: p2,
      warning: `Matched ${p2.length} interactive element(s) but they may be off-screen. Scroll to bring them into view.`,
    }
  }

  const p3 = grepElements(visible, query)
  if (p3.length > 0) {
    const hasOversizedContainer = p3.some(el => {
      if (el.type !== 'Other') return false
      const f = el.frame
      if (!f) return false
      return f.width > screenWidth * 0.8 && f.height > screenHeight * 0.4
    })
    return {
      elements: p3,
      warning: hasOversizedContainer
        ? `Matched element(s) contain "${query}" in their label but are large container elements. The exact tap target is somewhere within that frame; use coordinate guessing or describe_point to narrow it down.`
        : undefined,
    }
  }

  const p4 = grepElements(base, query)
  if (p4.length > 0) {
    return {
      elements: p4,
      warning: `No visible interactive match. Found ${p4.length} element(s) matching "${query}" — may be off-screen or non-interactive.`,
    }
  }

  return {
    elements: visibleInteractive,
    warning: `No elements matching "${query}" found. Returning all ${visibleInteractive.length} visible interactive elements instead.`,
  }
}

export function applyDescribeScreenFilters(
  rawElements: UIElement[],
  screenWidth: number,
  screenHeight: number,
): UIElement[] {
  return filterVisibleCoords(filterUnlabeledOther(rawElements), screenWidth, screenHeight)
}
