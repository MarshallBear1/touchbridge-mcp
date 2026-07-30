import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  CAPTURE_MANIFEST_SCHEMA,
  CAPTURE_UI_SCHEMA,
  capturesRoot,
} from './brand.js'

// This module intentionally imports only Node built-ins so its pure helpers
// can be unit-tested with `node --test` without building the project first.

export { CAPTURE_MANIFEST_SCHEMA, CAPTURE_UI_SCHEMA }
export const CAPTURE_MANIFEST_VERSION = 1
export const CAPTURE_UI_VERSION = 1
export const HANDOFF_CONTRACT = 'design-snapshot'
export const HANDOFF_CONTRACT_VERSION = 1

export const SCREEN_PNG_FILENAME = 'screen.png'
export const PREVIEW_PNG_FILENAME = 'preview.png'
export const UI_JSON_FILENAME = 'ui.json'
export const MANIFEST_FILENAME = 'manifest.json'

const MAX_NAME_LENGTH = 64
const CAPTURE_ID_SUFFIX_RE = /^[0-9a-f]{4,32}$/
const SENSITIVE_UI_PATTERN = /\b(password|passcode|pin|one[- ]time|otp|verification code|security code|cvv|cvc|secret|access token|api key)\b/i
const REDACTED_VALUE = '[REDACTED]'

export type CaptureTargetKind = 'simulator' | 'physical-device'

export function defaultCapturesRoot(): string {
  return capturesRoot()
}

/**
 * Reduce a human-supplied capture name to a filesystem-safe slug.
 * Returns null for blank names or names with no usable characters, so
 * callers can fall back to an unnamed capture. Path separators, dots,
 * and all other special characters are collapsed to single dashes,
 * which neutralizes traversal attempts like "../../etc".
 */
export function sanitizeCaptureName(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '')
  return slug.length > 0 ? slug : null
}

export function buildCaptureId(now: Date, suffix: string): string {
  if (Number.isNaN(now.getTime())) throw new Error('Invalid capture timestamp')
  if (!CAPTURE_ID_SUFFIX_RE.test(suffix)) throw new Error(`Invalid capture id suffix: ${JSON.stringify(suffix)}`)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `${stamp}-${suffix}`
}

export function captureDirectoryName(id: string, name: string | null): string {
  return name ? `${id}-${name}` : id
}

/**
 * Allocate a unique durable directory for one capture. Uses a non-recursive
 * mkdir so an existing directory fails with EEXIST instead of being reused,
 * guaranteeing captures never overwrite each other.
 */
export async function createCaptureDirectory(
  root: string,
  name: string | null,
): Promise<{ id: string; directory: string }> {
  await fs.mkdir(root, { recursive: true })
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = buildCaptureId(new Date(), randomBytes(4).toString('hex'))
    const directory = path.join(root, captureDirectoryName(id, name))
    try {
      await fs.mkdir(directory)
      return { id, directory }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('Could not allocate a unique capture directory')
}

export function parseSipsDimensions(output: string): { width: number; height: number } | null {
  const widthMatch = output.match(/pixelWidth:\s*(\d+)/)
  const heightMatch = output.match(/pixelHeight:\s*(\d+)/)
  if (!widthMatch || !heightMatch) return null
  const width = Number(widthMatch[1])
  const height = Number(heightMatch[1])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

export function previewDimensions(pixelWidth: number, pixelHeight: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(pixelWidth / 3)),
    height: Math.max(1, Math.round(pixelHeight / 3)),
  }
}

export function isSensitiveUiElement(element: Record<string, unknown>): boolean {
  if (String(element.type ?? '').toLowerCase().includes('securetext')) return true
  const searchable = [
    element.AXLabel,
    element.label,
    element.title,
    element.name,
    element.placeholder,
    element.placeholderValue,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return SENSITIVE_UI_PATTERN.test(searchable)
}

export function redactSensitiveUiElements<T extends Record<string, unknown>>(elements: T[]): T[] {
  return elements.map((element) => {
    if (!isSensitiveUiElement(element)) return element
    const redacted: Record<string, unknown> = { ...element }
    for (const key of ['AXValue', 'value', 'text']) {
      if (key in redacted && redacted[key] != null) {
        redacted[key] = REDACTED_VALUE
      }
    }
    return redacted as T
  })
}

export function deriveScreenPointSize(
  elements: Array<Record<string, unknown>>,
): { width: number; height: number } | null {
  const candidates = elements.flatMap((element) => {
    const frame = element.frame
    if (!frame || typeof frame !== 'object') return []
    const { x, y, width, height } = frame as Record<string, unknown>
    if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))) return []
    if ((width as number) <= 0 || (height as number) <= 0) return []
    return [{
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
      isApplication: element.type === 'Application' || element.role === 'AXApplication',
    }]
  })

  const applicationFrame = candidates.find(candidate =>
    candidate.isApplication && candidate.x === 0 && candidate.y === 0,
  )
  const rootFrame = applicationFrame ?? candidates
    .filter(candidate => candidate.x === 0 && candidate.y === 0)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]

  return rootFrame
    ? { width: rootFrame.width, height: rootFrame.height }
    : null
}

export async function readPngPixelDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const output = await new Promise<string>((resolve, reject) => {
    execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], { timeout: 5000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
  const dimensions = parseSipsDimensions(output)
  if (!dimensions) throw new Error(`Could not determine pixel dimensions of ${filePath}`)
  return dimensions
}

export async function writePreviewPng(
  sourcePath: string,
  destPath: string,
  pixelWidth: number,
  pixelHeight: number,
): Promise<void> {
  const target = previewDimensions(pixelWidth, pixelHeight)
  await new Promise<void>((resolve, reject) => {
    execFile(
      'sips',
      ['--resampleWidth', String(target.width), '--resampleHeight', String(target.height), sourcePath, '--out', destPath],
      { timeout: 5000 },
      (error) => {
        if (error) reject(error)
        else resolve()
      }
    )
  })
}

export async function writeJsonArtifact(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n')
}

export interface CaptureManifestInput {
  id: string
  name: string | null
  createdAt: Date
  targetKind: CaptureTargetKind
  udid: string
  directory: string
  image: { fileName: string; pixelWidth: number; pixelHeight: number }
  preview: { fileName: string } | null
  screenPointSize: { width: number; height: number } | null
  ui: { fileName: string; elementCount: number } | null
}

export interface CaptureManifestV1 {
  schema: typeof CAPTURE_MANIFEST_SCHEMA
  schema_version: typeof CAPTURE_MANIFEST_VERSION
  handoff: { contract: typeof HANDOFF_CONTRACT; version: typeof HANDOFF_CONTRACT_VERSION }
  capture: { id: string; name: string | null; created_at: string }
  source: { platform: 'ios'; target: CaptureTargetKind; udid: string }
  image: { path: string; file: string; mime_type: 'image/png'; pixel_width: number; pixel_height: number }
  preview: { path: string; file: string; mime_type: 'image/png' } | null
  screen_points: { width: number; height: number } | null
  ui: { path: string; file: string; format: string; element_count: number } | null
}

export function buildCaptureManifest(input: CaptureManifestInput): CaptureManifestV1 {
  if (!input.id.trim()) throw new Error('Capture id must not be blank')
  if (!input.udid.trim()) throw new Error('Capture udid must not be blank')
  if (!input.directory.trim()) throw new Error('Capture directory must not be blank')
  if (Number.isNaN(input.createdAt.getTime())) throw new Error('Invalid capture timestamp')
  const { pixelWidth, pixelHeight } = input.image
  if (!Number.isSafeInteger(pixelWidth) || pixelWidth <= 0 || !Number.isSafeInteger(pixelHeight) || pixelHeight <= 0) {
    throw new Error(`Invalid image pixel dimensions: ${pixelWidth}x${pixelHeight}`)
  }
  if (input.ui && (!Number.isSafeInteger(input.ui.elementCount) || input.ui.elementCount < 0)) {
    throw new Error(`Invalid UI element count: ${input.ui.elementCount}`)
  }

  return {
    schema: CAPTURE_MANIFEST_SCHEMA,
    schema_version: CAPTURE_MANIFEST_VERSION,
    handoff: { contract: HANDOFF_CONTRACT, version: HANDOFF_CONTRACT_VERSION },
    capture: {
      id: input.id,
      name: input.name,
      created_at: input.createdAt.toISOString(),
    },
    source: { platform: 'ios', target: input.targetKind, udid: input.udid },
    image: {
      path: path.join(input.directory, input.image.fileName),
      file: input.image.fileName,
      mime_type: 'image/png',
      pixel_width: pixelWidth,
      pixel_height: pixelHeight,
    },
    preview: input.preview
      ? { path: path.join(input.directory, input.preview.fileName), file: input.preview.fileName, mime_type: 'image/png' }
      : null,
    screen_points: input.screenPointSize
      ? { width: input.screenPointSize.width, height: input.screenPointSize.height }
      : null,
    ui: input.ui
      ? {
          path: path.join(input.directory, input.ui.fileName),
          file: input.ui.fileName,
          format: `${CAPTURE_UI_SCHEMA}@${CAPTURE_UI_VERSION}`,
          element_count: input.ui.elementCount,
        }
      : null,
  }
}
