import { execFile } from 'child_process'
import { promisify } from 'util'
import { log } from './logger.js'
import { listPhysicalDevices, type PhysicalDevice } from './wda/device-discovery.js'
import { buildViewerUrl } from './viewer/server.js'

const execFileAsync = promisify(execFile)

interface SimulatorInfo {
  udid: string
  name: string
  state: string
}

interface ExecutionContextSimulator {
  target: 'simulator'
  udid: string
  name: string
}

interface ExecutionContextDevice {
  target: 'device'
  udid: string
  name: string
  model: string
  connectionType: string
  developerModeEnabled: boolean
  wdaInstalled: boolean
  wdaRunning: boolean
  viewerUrl: string | null
}

interface ExecutionContextAmbiguous {
  target: 'ambiguous'
  simulators: SimulatorInfo[]
  physicalDevices: PhysicalDevice[]
}

interface ExecutionContextNone {
  target: 'none'
  message: string
}

export type ExecutionContext =
  | ExecutionContextSimulator
  | ExecutionContextDevice
  | ExecutionContextAmbiguous
  | ExecutionContextNone

let cachedContext: ExecutionContext | null = null

async function listBootedSimulators(): Promise<SimulatorInfo[]> {
  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { timeout: 10000 })
    const data = JSON.parse(stdout)
    const simulators: SimulatorInfo[] = []
    for (const runtime of Object.values(data.devices) as { udid: string; name: string; state: string }[][]) {
      for (const device of runtime) {
        if (device.state === 'Booted') {
          simulators.push({ udid: device.udid, name: device.name, state: device.state })
        }
      }
    }
    return simulators
  } catch {
    return []
  }
}

export async function detectExecutionContext(viewerPort: number): Promise<ExecutionContext> {
  const simulators = await listBootedSimulators()
  const physicalDevices = await listPhysicalDevices()

  log('ExecutionContext', 'log', `Found ${simulators.length} simulator(s), ${physicalDevices.length} physical device(s)`)

  if (simulators.length === 0 && physicalDevices.length === 0) {
    return {
      target: 'none',
      message: 'No iPhone or simulator found. Boot a simulator or connect an iPhone.',
    }
  }

  if (simulators.length === 1 && physicalDevices.length === 0) {
    cachedContext = {
      target: 'simulator',
      udid: simulators[0].udid,
      name: simulators[0].name,
    }
    return cachedContext
  }

  if (physicalDevices.length === 1 && simulators.length === 0) {
    cachedContext = {
      target: 'device',
      udid: physicalDevices[0].udid,
      name: physicalDevices[0].name,
      model: physicalDevices[0].model,
      connectionType: physicalDevices[0].connectionType,
      developerModeEnabled: physicalDevices[0].developerModeEnabled,
      wdaInstalled: physicalDevices[0].wdaInstalled,
      wdaRunning: physicalDevices[0].wdaRunning,
      viewerUrl: viewerPort > 0 ? buildViewerUrl(viewerPort, physicalDevices[0].udid) : null,
    }
    return cachedContext
  }

  return {
    target: 'ambiguous',
    simulators,
    physicalDevices,
  }
}

export function setExecutionContext(ctx: ExecutionContext): void {
  cachedContext = ctx
}

export function getCachedContext(): ExecutionContext | null {
  return cachedContext
}
