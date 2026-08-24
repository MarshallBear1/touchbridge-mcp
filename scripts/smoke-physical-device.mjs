#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const cliPath = path.join(repositoryRoot, 'dist', 'cli.js')

function readUdid(argv) {
  const inline = argv.find(argument => argument.startsWith('--udid='))
  if (inline) return inline.slice('--udid='.length)
  const index = argv.indexOf('--udid')
  return index >= 0 ? argv[index + 1] : null
}

function textBlocks(result) {
  return result.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
}

function parseLeadingJson(text) {
  const start = text.search(/[\[{]/)
  if (start < 0) throw new Error('No JSON value found')

  const opening = text[start]
  const closing = opening === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === opening) depth++
    else if (character === closing && --depth === 0) return JSON.parse(text.slice(start, index + 1))
  }
  throw new Error('Incomplete JSON value')
}

function parseJsonText(result, label) {
  for (const text of textBlocks(result).toReversed()) {
    try {
      return JSON.parse(text)
    } catch {
      try {
        return parseLeadingJson(text)
      } catch {
        // Try the next text block.
      }
    }
  }
  throw new Error(`${label} did not return a JSON text block`)
}

async function main() {
  const udid = readUdid(process.argv.slice(2))
  if (!udid) {
    throw new Error('Usage: npm run smoke:physical -- --udid <physical-device-udid>')
  }

  await fs.access(cliPath)
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath],
    cwd: repositoryRoot,
    stderr: 'pipe',
  })
  const client = new Client({ name: 'touchbridge-physical-smoke', version: '1.0.0' })
  let screenshotPath = null

  const callTool = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    if (result.isError) {
      throw new Error(`${name} failed: ${textBlocks(result).join('\n')}`)
    }
    return result
  }

  try {
    await client.connect(transport)

    const doctor = parseJsonText(await callTool('doctor'), 'doctor')
    console.log(`doctor: ${doctor.summary.pass} pass, ${doctor.summary.warn} warn, ${doctor.summary.fail} fail`)

    const devices = parseJsonText(await callTool('list_devices'), 'list_devices')
    const device = devices.physicalDevices.find(candidate => candidate.udid === udid)
    if (!device) {
      throw new Error(`Physical device ${udid} is not connected. Keep it unlocked, trusted, and attached with a data-capable USB cable.`)
    }
    console.log(`device: ${device.name} (${device.model}) via ${device.connectionType}`)

    const setupResult = await callTool('setup_device', { udid })
    const setupText = textBlocks(setupResult).join('\n')
    let setup
    try {
      setup = parseJsonText(setupResult, 'setup_device')
    } catch {
      throw new Error(`WebDriverAgent setup is incomplete. Follow these instructions, then rerun the smoke test:\n${setupText}`)
    }
    if (setup.status !== 'connected') {
      throw new Error(`Unexpected setup_device status: ${setupText}`)
    }
    console.log('wda: connected')

    const screenshotResult = await callTool('get_screenshot', { udid })
    screenshotPath = textBlocks(screenshotResult)[0]
    const screenshot = await fs.stat(screenshotPath)
    if (!screenshot.isFile() || screenshot.size === 0) {
      throw new Error('get_screenshot returned an empty or missing PNG')
    }
    if (!screenshotResult.content.some(block => block.type === 'image')) {
      throw new Error('get_screenshot did not return an embedded preview')
    }
    console.log(`screenshot: ${screenshot.size} bytes (temporary file verified)`)

    const elements = parseJsonText(await callTool('scan_ui', { udid, region: 'full' }), 'scan_ui')
    if (!Array.isArray(elements)) throw new Error('scan_ui did not return an element array')
    console.log(`scan_ui: ${elements.length} visible interactive element(s)`)
    console.log('physical smoke test: PASS')
  } finally {
    if (screenshotPath) {
      const directory = path.dirname(screenshotPath)
      const isTouchBridgeTemp = path.dirname(directory) === os.tmpdir()
        && path.basename(directory).startsWith('touchbridge-screenshot-')
      if (isTouchBridgeTemp) await fs.rm(directory, { recursive: true, force: true })
    }
    await client.close().catch(() => {})
  }
}

main().catch(error => {
  console.error(`physical smoke test: FAIL\n${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
