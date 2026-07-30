#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import checkbox from '@inquirer/checkbox'
import { log } from './logger.js'
import { PACKAGE_VERSION } from './version.js'
import {
  CLI_NAME,
  CONFIG_KEY,
  DEFAULT_INSTALL_SPEC,
  PRODUCT_NAME,
  stateRoot,
} from './brand.js'

const execAsync = promisify(exec)

function printUsage(): void {
  process.stderr.write(`
${PRODUCT_NAME} v${PACKAGE_VERSION}

Usage:
  npx -y ${DEFAULT_INSTALL_SPEC}              Start the MCP server (stdio)
  npx -y ${DEFAULT_INSTALL_SPEC} --setup-all  Install deps + configure globally (Claude Code, Cursor, Codex, OpenCode)
  npx -y ${DEFAULT_INSTALL_SPEC} --setup-here Install deps + configure for current directory
  npx -y ${DEFAULT_INSTALL_SPEC} --setup      Interactive setup (prompts for scope)
  npx -y ${DEFAULT_INSTALL_SPEC} --doctor     Check local iOS tooling and devices
  npx -y ${DEFAULT_INSTALL_SPEC} --version    Print version
  npx -y ${DEFAULT_INSTALL_SPEC} --help       Show this help

Installed binary:
  ${CLI_NAME}
`)
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise(resolve => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function runSetup(scope?: 'all' | 'here'): Promise<void> {
  const touchbridgeHome = stateRoot()

  // Steps 1-5: Check/install dependencies (silent when everything is OK)
  try {
    execSync('xcode-select -p', { stdio: 'pipe' })
  } catch {
    process.stderr.write('\n  Xcode is required. Install from the App Store or run:\n')
    process.stderr.write('    xcode-select --install\n\n')
    process.exit(1)
  }

  try {
    execSync('which brew', { stdio: 'pipe' })
  } catch {
    process.stderr.write('\n  Homebrew is required. Install from https://brew.sh\n\n')
    process.exit(1)
  }

  const touchbridgeIdb = join(touchbridgeHome, 'python', 'bin', 'idb')
  if (existsSync(touchbridgeIdb)) {
    // already installed
  } else {
    process.stderr.write('\n  Installing idb (this may take a few minutes)...\n')
    mkdirSync(join(touchbridgeHome, 'python'), { recursive: true })
    mkdirSync(join(touchbridgeHome, 'idb-companion'), { recursive: true })
    try {
      process.stderr.write('    Installing idb_companion via Homebrew...\n')
      await execAsync('brew tap facebook/fb && brew install idb-companion', { timeout: 300_000 })
      process.stderr.write('    Installing fb-idb via pip...\n')
      await execAsync(`python3 -m venv "${join(touchbridgeHome, 'python')}" && "${join(touchbridgeHome, 'python', 'bin', 'pip')}" install fb-idb`, { timeout: 300_000 })
      process.stderr.write('    idb installed successfully\n')
    } catch (e) {
      process.stderr.write(`    Warning: idb installation failed: ${(e as Error).message}\n`)
      process.stderr.write('    You can install manually: brew install idb-companion && pip install fb-idb\n')
    }
  }

  const wdaPath = join(touchbridgeHome, 'wda-build', 'WebDriverAgent')
  if (existsSync(join(wdaPath, 'WebDriverAgent.xcodeproj'))) {
    // already installed
  } else {
    process.stderr.write('  Cloning WebDriverAgent...\n')
    mkdirSync(join(touchbridgeHome, 'wda-build'), { recursive: true })
    try {
      await execAsync(`git clone --depth 1 https://github.com/appium/WebDriverAgent.git "${wdaPath}"`, { timeout: 120_000 })
    } catch (e) {
      process.stderr.write(`    Warning: WDA clone failed: ${(e as Error).message}\n`)
      process.stderr.write('    Physical device support requires WDA. You can clone manually.\n')
    }
  }

  const touchbridgeAxScan = join(touchbridgeHome, 'bin', 'ax-scan')
  if (existsSync(touchbridgeAxScan)) {
    // already installed
  } else {
    try {
      const axScanDir = join(import.meta.dirname, 'idb', 'ax-scan')
      if (!existsSync(join(axScanDir, 'Makefile'))) {
        const distAxScanDir = join(import.meta.dirname, '..', 'src', 'idb', 'ax-scan')
        if (existsSync(join(distAxScanDir, 'Makefile'))) {
          await execAsync(`make -C "${distAxScanDir}" install INSTALL_DIR="${join(touchbridgeHome, 'bin')}"`, { timeout: 60_000 })
        }
      } else {
        await execAsync(`make -C "${axScanDir}" install INSTALL_DIR="${join(touchbridgeHome, 'bin')}"`, { timeout: 60_000 })
      }
    } catch { /* silent fallback */ }
  }

  // Configure MCP clients
  const configured: string[] = []

  if (scope === 'all') {
    // Global: always configure Claude Code, silently try Cursor and Codex if their dirs exist
    configured.push(...writeClaudeCodeConfig(join(homedir(), '.claude.json')))
    if (existsSync(join(homedir(), '.cursor'))) {
      configured.push(...writeCursorConfig(join(homedir(), '.cursor', 'mcp.json')))
    }
    if (existsSync(join(homedir(), '.codex'))) {
      configured.push(...writeCodexConfig(join(homedir(), '.codex', 'config.toml')))
    }
    if (existsSync(join(process.cwd(), 'opencode.json')) || existsSync(join(process.cwd(), 'opencode.jsonc'))) {
      configured.push(...writeOpenCodeConfig(join(process.cwd(), 'opencode.json')))
    }
  } else if (scope === 'here') {
    // Project-scoped: checkbox prompt for which clients to configure
    const choices = await checkbox<string>(
      {
        message: `Which AI agents should have access to ${PRODUCT_NAME}?`,
        choices: [
          { name: 'Claude Code', value: 'claude-code', checked: true },
          { name: 'Cursor', value: 'cursor' },
          { name: 'Codex', value: 'codex' },
          { name: 'OpenCode', value: 'opencode' },
        ],
      },
      { output: process.stderr },
    )

    if (choices.includes('claude-code')) {
      configured.push(...writeClaudeCodeConfig(join(process.cwd(), '.mcp.json')))
    }
    if (choices.includes('cursor')) {
      mkdirSync(join(process.cwd(), '.cursor'), { recursive: true })
      configured.push(...writeCursorConfig(join(process.cwd(), '.cursor', 'mcp.json')))
    }
    if (choices.includes('codex')) {
      mkdirSync(join(process.cwd(), '.codex'), { recursive: true })
      configured.push(...writeCodexConfig(join(process.cwd(), '.codex', 'config.toml')))
    }
    if (choices.includes('opencode')) {
      configured.push(...writeOpenCodeConfig(join(process.cwd(), 'opencode.json')))
    }
  } else {
    // Interactive --setup: ask scope first, then configure
    const answer = await prompt('\n  Install MCP config:\n    1. System-wide (all projects) [recommended]\n    2. Current directory only\n  Choose (1/2): ')
    if (answer === '2') {
      configured.push(...writeClaudeCodeConfig(join(process.cwd(), '.mcp.json')))
    } else {
      configured.push(...writeClaudeCodeConfig(join(homedir(), '.claude.json')))
      if (existsSync(join(homedir(), '.cursor'))) {
        configured.push(...writeCursorConfig(join(homedir(), '.cursor', 'mcp.json')))
      }
      if (existsSync(join(homedir(), '.codex'))) {
        configured.push(...writeCodexConfig(join(homedir(), '.codex', 'config.toml')))
      }
      if (existsSync(join(process.cwd(), 'opencode.json')) || existsSync(join(process.cwd(), 'opencode.jsonc'))) {
        configured.push(...writeOpenCodeConfig(join(process.cwd(), 'opencode.json')))
      }
    }
  }

  if (configured.length > 0) {
    process.stderr.write(`\n  Configured: ${configured.join(', ')}\n`)
  }
  process.stderr.write('\n  Setup complete! Restart your AI agent to activate.\n\n')
}

function writeJsonMcpConfig(configPath: string): boolean {
  const mcpServers = {
    [CONFIG_KEY]: {
      command: 'npx',
      args: ['-y', DEFAULT_INSTALL_SPEC],
    },
  }

  try {
    let existing: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      existing = JSON.parse(readFileSync(configPath, 'utf8'))
    }
    const merged = {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers as Record<string, unknown> ?? {}),
        ...mcpServers,
      },
    }
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n')
    process.stderr.write(`    Written: ${configPath}\n`)
    return true
  } catch (e) {
    process.stderr.write(`    Warning: Could not write ${configPath}: ${(e as Error).message}\n`)
    return false
  }
}

export function writeClaudeCodeConfig(configPath: string): string[] {
  return writeJsonMcpConfig(configPath) ? ['Claude Code'] : []
}

export function writeCursorConfig(configPath: string): string[] {
  return writeJsonMcpConfig(configPath) ? ['Cursor'] : []
}

export function writeOpenCodeConfig(configPath: string): string[] {
  const mcpEntry = {
    [CONFIG_KEY]: {
      type: 'local',
      command: ['npx', '-y', DEFAULT_INSTALL_SPEC],
      enabled: true,
    },
  }

  try {
    let existing: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      existing = JSON.parse(readFileSync(configPath, 'utf8'))
    }
    const merged = {
      ...existing,
      mcp: {
        ...(existing.mcp as Record<string, unknown> ?? {}),
        ...mcpEntry,
      },
    }
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n')
    process.stderr.write(`    Written: ${configPath}\n`)
    return ['OpenCode']
  } catch (e) {
    process.stderr.write(`    Warning: Could not write ${configPath}: ${(e as Error).message}\n`)
    return []
  }
}

export function upsertCodexConfig(existing: string): string {
  const blockLines = [
    `[mcp_servers.${CONFIG_KEY}]`,
    'command = "npx"',
    `args = ["-y", "${DEFAULT_INSTALL_SPEC}"]`,
  ]
  const lines = existing.replace(/\s+$/, '').split('\n')
  const start = lines.findIndex(line => line.trim() === `[mcp_servers.${CONFIG_KEY}]`)

  if (start >= 0) {
    let end = start + 1
    while (end < lines.length && !lines[end].trimStart().startsWith('[')) end++
    lines.splice(start, end - start, ...blockLines)
    return `${lines.join('\n').replace(/^\n+/, '')}\n`
  }

  const prefix = lines.length === 1 && lines[0] === '' ? [] : lines
  return `${[...prefix, ...(prefix.length > 0 ? [''] : []), ...blockLines].join('\n')}\n`
}

export function writeCodexConfig(configPath: string): string[] {
  try {
    let existing = ''
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, 'utf8')
    }
    writeFileSync(configPath, upsertCodexConfig(existing))
    process.stderr.write(`    Written: ${configPath}\n`)
    return ['Codex']
  } catch (e) {
    process.stderr.write(`    Warning: Could not write ${configPath}: ${(e as Error).message}\n`)
    return []
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    process.stderr.write(`${PRODUCT_NAME} v${PACKAGE_VERSION}\n`)
    process.exit(0)
  }

  if (args.includes('--doctor')) {
    const { runDoctor } = await import('./doctor.js')
    const report = await runDoctor()
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exit(report.ok ? 0 : 1)
  }

  if (args.includes('--setup-all')) {
    await runSetup('all')
    process.exit(0)
  }

  if (args.includes('--setup-here')) {
    await runSetup('here')
    process.exit(0)
  }

  if (args.includes('--setup')) {
    await runSetup()
    process.exit(0)
  }

  // Default: start MCP server
  const { startServer } = await import('./index.js')
  await startServer()
}

export function isCliEntrypoint(argvPath: string | undefined = process.argv[1]): boolean {
  if (!argvPath) return false
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isCliEntrypoint()) {
  main().catch(e => {
    log('CLI', 'error', `Fatal error: ${e}`)
    process.exit(1)
  })
}
