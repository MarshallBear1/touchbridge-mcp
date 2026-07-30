import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  CAPTURE_MANIFEST_SCHEMA,
  CAPTURE_UI_SCHEMA,
  EDITOR_LAYER_MAP_SCHEMA,
  capturesRoot,
} from './brand.js'

// This module intentionally imports only Node built-ins so its pure helpers
// can be unit-tested with `node --test` without building the project first.

export { CAPTURE_MANIFEST_SCHEMA, CAPTURE_UI_SCHEMA, EDITOR_LAYER_MAP_SCHEMA }
export const CAPTURE_MANIFEST_VERSION = 1
export const CAPTURE_UI_VERSION = 1
export const EDITOR_LAYER_MAP_VERSION = 1
export const HANDOFF_CONTRACT = 'design-snapshot'
export const HANDOFF_CONTRACT_VERSION = 1

export const SCREEN_PNG_FILENAME = 'screen.png'
export const PREVIEW_PNG_FILENAME = 'preview.png'
export const UI_JSON_FILENAME = 'ui.json'
export const EDITOR_JSON_FILENAME = 'editor.json'
export const MANIFEST_FILENAME = 'manifest.json'

const MAX_NAME_LENGTH = 64
const MAX_INTENT_LENGTH = 500
const CAPTURE_ID_SUFFIX_RE = /^[0-9a-f]{4,32}$/
const SENSITIVE_UI_PATTERN = /\b(password|passcode|pin|one[- ]time|otp|verification code|security code|cvv|cvc|secret|access token|api key)\b/i
const REDACTED_VALUE = '[REDACTED]'
const SENSITIVE_INTENT_ASSIGNMENT_PATTERN = /\b(password|passcode|pin|one[- ]time code|otp|verification code|security code|cvv|cvc|secret|access token|api key)\b(\s*(?:is|=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const INTERACTIVE_TYPE_PATTERN = /\b(button|link|slider|switch|toggle|textfield|securetext|searchfield|checkbox|radio|menuitem|icon)\b/i

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

export function sanitizeEditorIntent(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const compact = raw.trim().replace(/\s+/g, ' ')
  if (!compact) return null
  return compact
    .replace(
      SENSITIVE_INTENT_ASSIGNMENT_PATTERN,
      (_match, label: string, separator: string) => `${label}${separator}${REDACTED_VALUE}`,
    )
    .slice(0, MAX_INTENT_LENGTH)
    .trim()
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

interface EditorLayerMapInput {
  captureId: string
  intent: string | null
  screenPointSize: { width: number; height: number }
  pixelSize: { width: number; height: number }
  elements: Array<Record<string, unknown>>
}

export interface EditorLayerMapV1 {
  schema: typeof EDITOR_LAYER_MAP_SCHEMA
  schema_version: typeof EDITOR_LAYER_MAP_VERSION
  capture_id: string
  intent: string | null
  canvas: {
    coordinate_space: 'ios-points'
    width: number
    height: number
    pixel_width: number
    pixel_height: number
    pixels_per_point: { x: number; y: number }
  }
  image: { file: typeof SCREEN_PNG_FILENAME; scale_mode: 'FIT' }
  layers: Array<{
    id: string
    name: string
    source_type: string
    semantic_role: string
    interactive: boolean
    enabled: boolean | null
    value: string | null
    frame: { x: number; y: number; width: number; height: number }
    normalized_frame: { x: number; y: number; width: number; height: number }
  }>
  figma: {
    suggested_frame_name: string
    overlay: { stroke: string; fill: string; fill_opacity: number; corner_radius: number }
  }
}

function finiteFrame(value: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== 'object') return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (![x, y, width, height].every(item => typeof item === 'number' && Number.isFinite(item))) return null
  if ((width as number) <= 0 || (height as number) <= 0) return null
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function buildEditorLayerMap(input: EditorLayerMapInput): EditorLayerMapV1 {
  const { width, height } = input.screenPointSize
  const { width: pixelWidth, height: pixelHeight } = input.pixelSize
  if (![width, height, pixelWidth, pixelHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Editor layer map requires positive point and pixel dimensions')
  }
  if (!input.captureId.trim()) throw new Error('Editor layer map capture id must not be blank')

  const layers = input.elements.flatMap((element, index) => {
    const frame = finiteFrame(element.frame)
    const sourceType = firstText(element.type) ?? 'Unknown'
    if (!frame || sourceType === 'Application' || element.role === 'AXApplication') return []
    const name = firstText(
      element.AXLabel,
      element.label,
      element.title,
      element.name,
      element.AXUniqueId,
      sourceType,
    ) ?? `Layer ${index + 1}`
    const semanticRole = firstText(element.role_description, element.role, sourceType) ?? sourceType
    const value = firstText(element.AXValue, element.value)
    return [{
      id: `ax-${String(index + 1).padStart(3, '0')}`,
      name: name.slice(0, 120),
      source_type: sourceType,
      semantic_role: semanticRole,
      interactive: INTERACTIVE_TYPE_PATTERN.test(`${sourceType} ${semanticRole}`),
      enabled: typeof element.enabled === 'boolean' ? element.enabled : null,
      value: value?.slice(0, 200) ?? null,
      frame,
      normalized_frame: {
        x: rounded(frame.x / width),
        y: rounded(frame.y / height),
        width: rounded(frame.width / width),
        height: rounded(frame.height / height),
      },
    }]
  })

  return {
    schema: EDITOR_LAYER_MAP_SCHEMA,
    schema_version: EDITOR_LAYER_MAP_VERSION,
    capture_id: input.captureId,
    intent: input.intent,
    canvas: {
      coordinate_space: 'ios-points',
      width,
      height,
      pixel_width: pixelWidth,
      pixel_height: pixelHeight,
      pixels_per_point: {
        x: rounded(pixelWidth / width),
        y: rounded(pixelHeight / height),
      },
    },
    image: { file: SCREEN_PNG_FILENAME, scale_mode: 'FIT' },
    layers,
    figma: {
      suggested_frame_name: input.intent ? `TouchBridge / ${input.intent.slice(0, 80)}` : 'TouchBridge / Editable capture',
      overlay: {
        stroke: '#67D9FA',
        fill: '#7C3AED',
        fill_opacity: 0.14,
        corner_radius: 10,
      },
    },
  }
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
  intent: string | null
  editor: { fileName: string; layerCount: number } | null
}

export interface CaptureManifestV1 {
  schema: typeof CAPTURE_MANIFEST_SCHEMA
  schema_version: typeof CAPTURE_MANIFEST_VERSION
  handoff: {
    contract: typeof HANDOFF_CONTRACT
    version: typeof HANDOFF_CONTRACT_VERSION
    intent: string | null
  }
  capture: { id: string; name: string | null; created_at: string }
  source: { platform: 'ios'; target: CaptureTargetKind; udid: string }
  image: { path: string; file: string; mime_type: 'image/png'; pixel_width: number; pixel_height: number }
  preview: { path: string; file: string; mime_type: 'image/png' } | null
  screen_points: { width: number; height: number } | null
  ui: { path: string; file: string; format: string; element_count: number } | null
  editor: { path: string; file: string; format: string; layer_count: number } | null
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
  if (input.editor && (!Number.isSafeInteger(input.editor.layerCount) || input.editor.layerCount < 0)) {
    throw new Error(`Invalid editor layer count: ${input.editor.layerCount}`)
  }

  return {
    schema: CAPTURE_MANIFEST_SCHEMA,
    schema_version: CAPTURE_MANIFEST_VERSION,
    handoff: {
      contract: HANDOFF_CONTRACT,
      version: HANDOFF_CONTRACT_VERSION,
      intent: input.intent,
    },
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
    editor: input.editor
      ? {
          path: path.join(input.directory, input.editor.fileName),
          file: input.editor.fileName,
          format: `${EDITOR_LAYER_MAP_SCHEMA}@${EDITOR_LAYER_MAP_VERSION}`,
          layer_count: input.editor.layerCount,
        }
      : null,
  }
}
