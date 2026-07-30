import type { WDAClient } from './wda-client.js'
import type { ScanRegion } from '../types.js'
import { log } from '../logger.js'

export async function wdaScanGrid(
  client: WDAClient,
  region: ScanRegion,
): Promise<unknown[]> {
  const xml = await client.getSource()
  log('WDAScan', 'log', `Got page source: ${xml.length} chars`)

  const allElements = client.parseAccessibilityXml(xml)
  log('WDAScan', 'log', `Parsed ${allElements.length} visible elements from source`)

  if (region === 'full') return allElements

  let screenWidth = 393
  let screenHeight = 852
  try {
    const size = await client.getWindowSize()
    screenWidth = size.width
    screenHeight = size.height
  } catch {
    log('WDAScan', 'warn', 'Could not get window size, using defaults')
  }

  const midX = Math.round(screenWidth / 2)
  const midY = Math.round(screenHeight / 2)

  type Bounds = { xMin: number; yMin: number; xMax: number; yMax: number }
  const regionBounds: Record<Exclude<ScanRegion, 'full'>, Bounds> = {
    'top-half': { xMin: 0, yMin: 0, xMax: screenWidth, yMax: midY },
    'bottom-half': { xMin: 0, yMin: midY, xMax: screenWidth, yMax: screenHeight },
    'top-left': { xMin: 0, yMin: 0, xMax: midX, yMax: midY },
    'top-right': { xMin: midX, yMin: 0, xMax: screenWidth, yMax: midY },
    'bottom-left': { xMin: 0, yMin: midY, xMax: midX, yMax: screenHeight },
    'bottom-right': { xMin: midX, yMin: midY, xMax: screenWidth, yMax: screenHeight },
  }

  const bounds = regionBounds[region]
  const filtered = allElements.filter((el) => {
    const frame = el.frame as { x: number; y: number; width: number; height: number } | undefined
    if (!frame) return false
    const cx = frame.x + frame.width / 2
    const cy = frame.y + frame.height / 2
    return cx >= bounds.xMin && cx < bounds.xMax && cy >= bounds.yMin && cy < bounds.yMax
  })

  log('WDAScan', 'log', `Region ${region}: ${filtered.length} elements (of ${allElements.length} total)`)
  return filtered
}
