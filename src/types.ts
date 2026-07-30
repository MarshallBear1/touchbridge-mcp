export type ButtonType = 'HOME' | 'LOCK' | 'SIDE_BUTTON' | 'APPLE_PAY' | 'SIRI'

export interface DeviceActionMap {
  tap: { x: number; y: number; duration?: number }
  swipe: { fromX: number; fromY: number; toX: number; toY: number; duration?: number; delta?: number }
  button: { button: ButtonType; duration?: number }
  'input-text': { text: string }
  key: { key: number | string; duration?: number }
  'key-sequence': { keySequence: (number | string)[] }
  'describe-all': { nested?: boolean }
  'describe-point': { x: number; y: number; nested?: boolean }
}

export type DeviceAction = keyof DeviceActionMap

export interface DeviceClient {
  tap(x: number, y: number, duration?: number): Promise<void>
  swipe(fromX: number, fromY: number, toX: number, toY: number, duration?: number, delta?: number): Promise<void>
  pressButton(button: ButtonType, duration?: number): Promise<void>
  inputText(text: string): Promise<void>
  pressKey(key: number | string, duration?: number): Promise<void>
  pressKeySequence(keySequence: (number | string)[]): Promise<void>
  describeAll(nested?: boolean): Promise<unknown>
  describePoint(x: number, y: number, nested?: boolean): Promise<unknown>
  screenshot(): Promise<Buffer>
}

const SIMULATOR_UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

export function isPhysicalDeviceUdid(udid: string): boolean {
  if (udid === 'booted') return false
  return !SIMULATOR_UUID_RE.test(udid)
}

export interface UIElement {
  type?: string
  AXLabel?: string | null
  label?: string | null
  title?: string | null
  name?: string | null
  AXValue?: string | null
  value?: string | null
  frame?: { x: number; y: number; width: number; height: number }
  [key: string]: unknown
}

export type ScanRegion =
  | 'full'
  | 'top-half'
  | 'bottom-half'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface ScanCommand {
  grid_step: number
  x_start: number
  y_start: number
  x_end: number
  y_end: number
}
