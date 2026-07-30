import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  upsertCodexConfig,
  isCliEntrypoint,
  writeClaudeCodeConfig,
  writeCodexConfig,
  writeOpenCodeConfig,
} from '../dist/cli.js'

test('CLI entrypoint detection follows npm-style symlinks', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'touchbridge-cli-entrypoint-'))
  t.after(async () => fs.rm(root, { recursive: true, force: true }))
  const linkedCli = path.join(root, 'touchbridge')
  await fs.symlink(path.resolve('dist/cli.js'), linkedCli)
  assert.equal(isCliEntrypoint(linkedCli), true)
  assert.equal(isCliEntrypoint(path.join(root, 'missing')), false)
})

test('upsertCodexConfig upgrades an existing interactive command and preserves its env section', () => {
  const existing = [
    'model = "gpt-5"',
    '',
    '[mcp_servers.touchbridge-ios]',
    'command = "npx"',
    'args = ["github:MarshallBear1/touchbridge-mcp"]',
    '',
    '[mcp_servers.touchbridge-ios.env]',
    'PATH = "/custom/bin"',
    '',
  ].join('\n')
  const updated = upsertCodexConfig(existing)
  assert.match(updated, /args = \["-y", "github:MarshallBear1\/touchbridge-mcp"\]/)
  assert.equal(updated.match(/\[mcp_servers\.touchbridge-ios\]/g)?.length, 1)
  assert.match(updated, /\[mcp_servers\.touchbridge-ios\.env\]\nPATH = "\/custom\/bin"/)
  assert.match(updated, /model = "gpt-5"/)
})

test('config writers generate non-interactive commands for supported clients', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'touchbridge-cli-config-'))
  t.after(async () => fs.rm(root, { recursive: true, force: true }))

  const claudePath = path.join(root, 'claude.json')
  const openCodePath = path.join(root, 'opencode.json')
  const codexPath = path.join(root, 'config.toml')
  writeClaudeCodeConfig(claudePath)
  writeOpenCodeConfig(openCodePath)
  writeCodexConfig(codexPath)

  const claude = JSON.parse(await fs.readFile(claudePath, 'utf8'))
  const openCode = JSON.parse(await fs.readFile(openCodePath, 'utf8'))
  assert.deepEqual(claude.mcpServers['touchbridge-ios'].args, ['-y', 'github:MarshallBear1/touchbridge-mcp'])
  assert.deepEqual(openCode.mcp['touchbridge-ios'].command, ['npx', '-y', 'github:MarshallBear1/touchbridge-mcp'])
  assert.match(await fs.readFile(codexPath, 'utf8'), /args = \["-y", "github:MarshallBear1\/touchbridge-mcp"\]/)
})
