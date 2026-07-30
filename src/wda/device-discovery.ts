import { exec } from 'child_process'
import { promisify } from 'util'
import { log } from '../logger.js'
import { childEnv } from '../child-env.js'
import { WDAClient } from './wda-client.js'

const execAsync = promisify(exec)

export interface PhysicalDevice {
  udid: string
  name: string
  model: string
  connectionType: 'usb' | 'wifi' | 'both'
  paired: boolean
  developerModeEnabled: boolean
  wdaInstalled: boolean
  wdaRunning: boolean
}

function isAppleMobilePlatform(platform: string): boolean {
  return platform.includes('iOS') || platform.includes('iPadOS')
}

export function parseDevicectlDevice(d: unknown): PhysicalDevice | null {
  if (!d || typeof d !== 'object') return null
  const record = d as Record<string, unknown>

  const hardwareProperties = (record.hardwareProperties ?? {}) as Record<string, unknown>
  const connectionProperties = (record.connectionProperties ?? {}) as Record<string, unknown>
  const deviceProperties = (record.deviceProperties ?? {}) as Record<string, unknown>

  const udid = hardwareProperties.udid ?? record.identifier
  if (typeof udid !== 'string' || !udid) return null

  const platform = String(hardwareProperties.platform ?? '')
  if (!isAppleMobilePlatform(platform)) return null

  const tunnelState = String(connectionProperties.tunnelState ?? '')
  const bootState = String(deviceProperties.bootState ?? '')
  const isAvailable = tunnelState === 'connected' || bootState === 'booted'
  if (!isAvailable) return null

  const transportType = String(connectionProperties.transportType ?? '')
  const connectionType: 'usb' | 'wifi' | 'both' =
    transportType === 'wired' ? 'usb'
    : transportType === 'localNetwork' ? 'wifi'
    : 'usb'

  return {
    udid,
    name: String(deviceProperties.name ?? 'iPhone'),
    model: String(hardwareProperties.marketingName ?? hardwareProperties.productType ?? 'iPhone'),
    connectionType,
    paired: true,
    developerModeEnabled: deviceProperties.developerModeStatus === 'enabled',
    wdaInstalled: false,
    wdaRunning: false,
  }
}

export async function listPhysicalDevices(): Promise<PhysicalDevice[]> {
  const devices: Map<string, PhysicalDevice> = new Map()

  try {
    const { stdout } = await execAsync('xcrun devicectl list devices --json-output /dev/stdout 2>/dev/null', { env: childEnv() })
    const jsonStart = stdout.indexOf('{')
    if (jsonStart < 0) throw new Error('No JSON in devicectl output')
    const json = JSON.parse(stdout.substring(jsonStart))
    const deviceList = json?.result?.devices ?? []

    for (const d of deviceList) {
      const device = parseDevicectlDevice(d)
      if (device) {
        devices.set(device.udid, device)
      }
    }
  } catch {
    log('DeviceDiscovery', 'log', 'xcrun devicectl not available, falling back to system_profiler')
  }

  if (devices.size === 0) {
    try {
      const { stdout } = await execAsync('system_profiler SPUSBDataType -json 2>/dev/null', { env: childEnv() })
      const json = JSON.parse(stdout)
      const usbItems = json?.SPUSBDataType ?? []

      const findIPhones = (items: Record<string, unknown>[]): void => {
        for (const item of items) {
          const name = item._name as string | undefined
          const serial = item.serial_num as string | undefined
          if (name && serial && (name.includes('iPhone') || name.includes('iPad'))) {
            devices.set(serial, {
              udid: serial,
              name,
              model: name,
              connectionType: 'usb',
              paired: true,
              developerModeEnabled: true,
              wdaInstalled: false,
              wdaRunning: false,
            })
          }
          if (item._items && Array.isArray(item._items)) {
            findIPhones(item._items as Record<string, unknown>[])
          }
        }
      }

      findIPhones(usbItems)
    } catch {
      log('DeviceDiscovery', 'log', 'system_profiler fallback also failed')
    }
  }

  const deviceList = Array.from(devices.values())
  await Promise.all(
    deviceList.map(async (device) => {
      try {
        const client = WDAClient.getInstance(device.udid)
        const running = await client.isReachable()
        device.wdaRunning = running
        device.wdaInstalled = running
      } catch {
        // WDA not reachable
      }
    })
  )

  return deviceList
}

export async function getPhysicalDevice(udid: string): Promise<PhysicalDevice | null> {
  const devices = await listPhysicalDevices()
  return devices.find(d => d.udid === udid) ?? null
}
