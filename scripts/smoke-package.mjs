#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'touchbridge-package-smoke-'))

try {
  const { stdout: packOutput } = await execFileAsync(
    'npm',
    ['pack', '--pack-destination', temporaryRoot],
    { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
  )
  const tarballName = packOutput.trim().split('\n').at(-1)
  if (!tarballName) throw new Error('npm pack did not return a tarball name')

  const installRoot = path.join(temporaryRoot, 'consumer')
  await execFileAsync('npm', ['install', '--prefix', installRoot, path.join(temporaryRoot, tarballName)], {
    maxBuffer: 10 * 1024 * 1024,
  })

  const executable = path.join(installRoot, 'node_modules', '.bin', 'touchbridge')
  const { stdout, stderr } = await execFileAsync(executable, ['--version'])
  const versionOutput = `${stdout}${stderr}`.trim()
  if (!/^TouchBridge v\d+\.\d+\.\d+$/.test(versionOutput)) {
    throw new Error(`Unexpected installed CLI version output: ${versionOutput || '(empty)'}`)
  }

  console.log(`package smoke: PASS (${tarballName}; ${versionOutput})`)
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
