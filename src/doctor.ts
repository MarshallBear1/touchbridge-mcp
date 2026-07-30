import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { childEnv } from './child-env.js'
import { listPhysicalDevices } from './wda/device-discovery.js'
import { PACKAGE_VERSION } from './version.js'

const execFileAsync = promisify(execFile)

export type DoctorStatus = 'pass' | 'warn' | 'fail'

export interface DoctorCheck {
  id: string
  status: DoctorStatus
  message: string
  detail?: string
}

export interface DoctorReport {
  ok: boolean
  version: string
  generated_at: string
  summary: Record<DoctorStatus, number>
  checks: DoctorCheck[]
}

export function summarizeDoctorChecks(checks: DoctorCheck[]): Record<DoctorStatus, number> {
  return checks.reduce<Record<DoctorStatus, number>>(
    (summary, check) => {
      summary[check.status]++
      return summary
    },
    { pass: 0, warn: 0, fail: 0 },
  )
}

async function checkCommand(
  id: string,
  label: string,
  command: string,
  args: string[],
  missingStatus: Exclude<DoctorStatus, 'pass'>,
): Promise<DoctorCheck> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      env: childEnv(),
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    })
    const detail = `${stdout}${stderr}`.trim().split('\n')[0]
    return {
      id,
      status: 'pass',
      message: `${label} is available`,
      ...(detail ? { detail } : {}),
    }
  } catch (error) {
    return {
      id,
      status: missingStatus,
      message: `${label} is unavailable`,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkDevices(): Promise<DoctorCheck> {
  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
      env: childEnv(),
      timeout: 10000,
    })
    const data = JSON.parse(stdout) as {
      devices?: Record<string, Array<{ state?: string }>>
    }
    const simulators = Object.values(data.devices ?? {})
      .flat()
      .filter(device => device.state === 'Booted').length
    const physicalDevices = await listPhysicalDevices()
    const total = simulators + physicalDevices.length

    return total > 0
      ? {
          id: 'devices',
          status: 'pass',
          message: `Found ${simulators} booted simulator(s) and ${physicalDevices.length} connected physical device(s)`,
        }
      : {
          id: 'devices',
          status: 'warn',
          message: 'No booted simulator or connected physical iPhone/iPad found',
          detail: 'Boot a simulator or connect and unlock a trusted device before using device tools.',
        }
  } catch (error) {
    return {
      id: 'devices',
      status: 'warn',
      message: 'Could not enumerate iOS devices',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runDoctor(): Promise<DoctorReport> {
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
  const supportedNode = nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 17)
  const checks: DoctorCheck[] = [
    process.platform === 'darwin'
      ? { id: 'platform', status: 'pass', message: 'Running on macOS' }
      : { id: 'platform', status: 'fail', message: `Unsupported platform: ${process.platform}`, detail: 'TouchBridge requires macOS.' },
    supportedNode
      ? { id: 'node', status: 'pass', message: `Node.js ${process.versions.node}` }
      : { id: 'node', status: 'fail', message: `Node.js ${process.versions.node} is too old`, detail: 'Node.js 20.17 or newer is required.' },
  ]

  checks.push(...await Promise.all([
    checkCommand('xcode', 'Xcode command-line tools', 'xcode-select', ['-p'], 'fail'),
    checkCommand('simctl', 'iOS Simulator tooling', 'xcrun', ['simctl', 'help'], 'fail'),
    checkCommand('sips', 'PNG image tooling', 'sips', ['--version'], 'fail'),
    checkCommand('idb', 'idb', 'idb', ['--help'], 'warn'),
    checkCommand('idb-companion', 'idb_companion', 'idb_companion', ['--version'], 'warn'),
    checkDevices(),
  ]))

  const summary = summarizeDoctorChecks(checks)
  return {
    ok: summary.fail === 0,
    version: PACKAGE_VERSION,
    generated_at: new Date().toISOString(),
    summary,
    checks,
  }
}
