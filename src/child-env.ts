import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { stateRoot } from './brand.js'

let _loginShellPath: string | null = null
function getLoginShellPath(): string {
  if (_loginShellPath !== null) return _loginShellPath
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const out = execFileSync(shell, ['-ilc', 'echo $PATH'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    _loginShellPath = out.trim()
  } catch {
    _loginShellPath = ''
  }
  return _loginShellPath
}

export function childEnv(): Record<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { NODE_ENV, ...baseEnv } = process.env as Record<string, string>

  const home = os.homedir()
  const touchbridgeHome = stateRoot()
  const pathParts: string[] = []

  // Inherited PATH
  pathParts.push(baseEnv.PATH ?? '')

  // Login shell PATH
  const loginPath = getLoginShellPath()
  if (loginPath) {
    pathParts.push(loginPath)
  }

  // Common bin directories
  const extraPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    path.join(touchbridgeHome, 'python/bin'),
    path.join(touchbridgeHome, 'idb-companion/bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
  for (const p of extraPaths) {
    pathParts.push(p)
  }

  return {
    ...baseEnv,
    PATH: pathParts.join(':'),
    LANG: baseEnv.LANG ?? 'en_US.UTF-8',
    HOME: baseEnv.HOME ?? home,
  }
}
