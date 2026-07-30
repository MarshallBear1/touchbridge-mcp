import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import {
  CAPTURE_MANIFEST_SCHEMA,
  CAPTURE_MANIFEST_VERSION,
  CAPTURE_UI_SCHEMA,
  CAPTURE_UI_VERSION,
  HANDOFF_CONTRACT,
  HANDOFF_CONTRACT_VERSION,
  SCREEN_PNG_FILENAME,
  PREVIEW_PNG_FILENAME,
  UI_JSON_FILENAME,
  sanitizeCaptureName,
  buildCaptureId,
  captureDirectoryName,
  createCaptureDirectory,
  parseSipsDimensions,
  previewDimensions,
  buildCaptureManifest,
  isSensitiveUiElement,
  redactSensitiveUiElements,
  deriveScreenPointSize,
} from '../dist/capture-artifact.js'

test('sanitizeCaptureName slugifies human names', () => {
  assert.equal(sanitizeCaptureName('Login Screen'), 'login-screen')
  assert.equal(sanitizeCaptureName('  Slide #2 (Final)  '), 'slide-2-final')
  assert.equal(sanitizeCaptureName('Checkout — Step 1'), 'checkout-step-1')
})

test('sanitizeCaptureName returns null for blank or unusable names', () => {
  assert.equal(sanitizeCaptureName(undefined), null)
  assert.equal(sanitizeCaptureName(null), null)
  assert.equal(sanitizeCaptureName(''), null)
  assert.equal(sanitizeCaptureName('   '), null)
  assert.equal(sanitizeCaptureName('...'), null)
  assert.equal(sanitizeCaptureName('///'), null)
  assert.equal(sanitizeCaptureName('!!!***'), null)
})

test('sanitizeCaptureName neutralizes path traversal attempts', () => {
  const traversals = ['../../etc/passwd', '..\\..\\windows', '/absolute/path', 'a/../../b', '~/.ssh/id_rsa']
  for (const raw of traversals) {
    const slug = sanitizeCaptureName(raw)
    assert.notEqual(slug, null, `expected a slug for ${JSON.stringify(raw)}`)
    assert.ok(!slug.includes('/'), `slug must not contain "/": ${slug}`)
    assert.ok(!slug.includes('\\'), `slug must not contain "\\": ${slug}`)
    assert.ok(!slug.includes('..'), `slug must not contain "..": ${slug}`)
    assert.match(slug, /^[a-z0-9][a-z0-9-]*$/)
  }
})

test('sanitizeCaptureName truncates long names without a trailing dash', () => {
  const slug = sanitizeCaptureName('a'.repeat(80) + ' extra words')
  assert.notEqual(slug, null)
  assert.ok(slug.length <= 64)
  assert.ok(!slug.endsWith('-'))
})

test('buildCaptureId is deterministic and filesystem-safe', () => {
  const id = buildCaptureId(new Date('2026-07-30T12:34:56.789Z'), 'ab12cd34')
  assert.equal(id, '2026-07-30T12-34-56-789Z-ab12cd34')
  assert.ok(!id.includes(':'))
  assert.ok(!id.includes('/'))
})

test('buildCaptureId rejects invalid inputs', () => {
  assert.throws(() => buildCaptureId(new Date('invalid'), 'ab12cd34'))
  assert.throws(() => buildCaptureId(new Date(), ''))
  assert.throws(() => buildCaptureId(new Date(), '../evil'))
  assert.throws(() => buildCaptureId(new Date(), 'UPPER'))
})

test('captureDirectoryName appends the name only when present', () => {
  assert.equal(captureDirectoryName('id123', 'login-screen'), 'id123-login-screen')
  assert.equal(captureDirectoryName('id123', null), 'id123')
})

test('createCaptureDirectory allocates unique directories even with identical names', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-artifact-test-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })

  const seen = new Set()
  for (let i = 0; i < 20; i++) {
    const { id, directory } = await createCaptureDirectory(root, 'same-name')
    assert.ok(!seen.has(directory), `directory allocated twice: ${directory}`)
    seen.add(directory)
    assert.ok(directory.startsWith(root + path.sep))
    assert.ok(path.basename(directory).includes(id))
    assert.ok(path.basename(directory).endsWith('-same-name'))
    const stat = await fs.stat(directory)
    assert.ok(stat.isDirectory())
  }
})

test('createCaptureDirectory works without a name', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-artifact-test-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })

  const { id, directory } = await createCaptureDirectory(root, null)
  assert.equal(path.basename(directory), id)
})

test('parseSipsDimensions parses valid sips output', () => {
  const output = '/tmp/x.png\n  pixelWidth: 1179\n  pixelHeight: 2556\n'
  assert.deepEqual(parseSipsDimensions(output), { width: 1179, height: 2556 })
})

test('parseSipsDimensions fails safely on malformed output', () => {
  assert.equal(parseSipsDimensions(''), null)
  assert.equal(parseSipsDimensions('garbage'), null)
  assert.equal(parseSipsDimensions('pixelWidth: 100'), null)
  assert.equal(parseSipsDimensions('pixelWidth: abc\npixelHeight: 200'), null)
  assert.equal(parseSipsDimensions('pixelWidth: 0\npixelHeight: 200'), null)
})

test('previewDimensions downscales by 3 with a floor of 1', () => {
  assert.deepEqual(previewDimensions(1179, 2556), { width: 393, height: 852 })
  assert.deepEqual(previewDimensions(2, 1), { width: 1, height: 1 })
})

test('design snapshot UI redacts sensitive values without mutating source elements', () => {
  const elements = [
    { type: 'SecureTextField', AXLabel: 'Password', AXValue: 'hunter2', value: 'hunter2' },
    { type: 'TextField', label: 'Verification code', value: '123456' },
    { type: 'StaticText', label: 'Account balance', value: '£42' },
  ]
  const redacted = redactSensitiveUiElements(elements)
  assert.equal(isSensitiveUiElement(elements[0]), true)
  assert.equal(isSensitiveUiElement(elements[2]), false)
  assert.equal(redacted[0].AXValue, '[REDACTED]')
  assert.equal(redacted[0].value, '[REDACTED]')
  assert.equal(redacted[1].value, '[REDACTED]')
  assert.equal(redacted[2].value, '£42')
  assert.equal(elements[0].value, 'hunter2')
})

test('deriveScreenPointSize prefers the accessibility application frame', () => {
  const elements = [
    { type: 'Button', frame: { x: 10, y: 20, width: 100, height: 44 } },
    { type: 'Application', role: 'AXApplication', frame: { x: 0, y: 0, width: 420, height: 912 } },
    { type: 'Window', frame: { x: 0, y: 0, width: 393, height: 852 } },
  ]
  assert.deepEqual(deriveScreenPointSize(elements), { width: 420, height: 912 })
})

test('deriveScreenPointSize falls back to the largest origin frame and rejects malformed frames', () => {
  const elements = [
    { frame: { x: 0, y: 0, width: 320, height: 640 } },
    { frame: { x: 0, y: 0, width: 420, height: 912 } },
    { frame: { x: 0, y: 0, width: '420', height: 912 } },
    { frame: { x: 0, y: 0, width: -1, height: 912 } },
  ]
  assert.deepEqual(deriveScreenPointSize(elements), { width: 420, height: 912 })
  assert.equal(deriveScreenPointSize([{ frame: null }, {}]), null)
})

function manifestInput(overrides = {}) {
  return {
    id: '2026-07-30T12-34-56-789Z-ab12cd34',
    name: 'login-screen',
    createdAt: new Date('2026-07-30T12:34:56.789Z'),
    targetKind: 'simulator',
    udid: 'AAAA1111-2222-3333-4444-555566667777',
    directory: '/tmp/captures/2026-07-30T12-34-56-789Z-ab12cd34-login-screen',
    image: { fileName: SCREEN_PNG_FILENAME, pixelWidth: 1179, pixelHeight: 2556 },
    preview: { fileName: PREVIEW_PNG_FILENAME },
    screenPointSize: { width: 393, height: 852 },
    ui: { fileName: UI_JSON_FILENAME, elementCount: 42 },
    ...overrides,
  }
}

test('buildCaptureManifest produces the v1 shape with a handoff contract', () => {
  const input = manifestInput()
  const manifest = buildCaptureManifest(input)

  assert.equal(manifest.schema, CAPTURE_MANIFEST_SCHEMA)
  assert.equal(manifest.schema_version, CAPTURE_MANIFEST_VERSION)
  assert.deepEqual(manifest.handoff, { contract: HANDOFF_CONTRACT, version: HANDOFF_CONTRACT_VERSION })
  assert.deepEqual(manifest.capture, {
    id: input.id,
    name: 'login-screen',
    created_at: '2026-07-30T12:34:56.789Z',
  })
  assert.deepEqual(manifest.source, { platform: 'ios', target: 'simulator', udid: input.udid })
  assert.deepEqual(manifest.image, {
    path: path.join(input.directory, SCREEN_PNG_FILENAME),
    file: SCREEN_PNG_FILENAME,
    mime_type: 'image/png',
    pixel_width: 1179,
    pixel_height: 2556,
  })
  assert.deepEqual(manifest.preview, {
    path: path.join(input.directory, PREVIEW_PNG_FILENAME),
    file: PREVIEW_PNG_FILENAME,
    mime_type: 'image/png',
  })
  assert.deepEqual(manifest.screen_points, { width: 393, height: 852 })
  assert.deepEqual(manifest.ui, {
    path: path.join(input.directory, UI_JSON_FILENAME),
    file: UI_JSON_FILENAME,
    format: `${CAPTURE_UI_SCHEMA}@${CAPTURE_UI_VERSION}`,
    element_count: 42,
  })
})

test('buildCaptureManifest supports unnamed captures and omitted optional artifacts', () => {
  const manifest = buildCaptureManifest(manifestInput({
    name: null,
    preview: null,
    screenPointSize: null,
    ui: null,
    targetKind: 'physical-device',
  }))
  assert.equal(manifest.capture.name, null)
  assert.equal(manifest.preview, null)
  assert.equal(manifest.screen_points, null)
  assert.equal(manifest.ui, null)
  assert.equal(manifest.source.target, 'physical-device')
})

test('buildCaptureManifest rejects invalid inputs', () => {
  assert.throws(() => buildCaptureManifest(manifestInput({ id: '  ' })))
  assert.throws(() => buildCaptureManifest(manifestInput({ udid: '' })))
  assert.throws(() => buildCaptureManifest(manifestInput({ directory: '' })))
  assert.throws(() => buildCaptureManifest(manifestInput({ createdAt: new Date('invalid') })))
  assert.throws(() => buildCaptureManifest(manifestInput({
    image: { fileName: SCREEN_PNG_FILENAME, pixelWidth: 0, pixelHeight: 2556 },
  })))
  assert.throws(() => buildCaptureManifest(manifestInput({
    image: { fileName: SCREEN_PNG_FILENAME, pixelWidth: 1179, pixelHeight: 2.5 },
  })))
  assert.throws(() => buildCaptureManifest(manifestInput({
    ui: { fileName: UI_JSON_FILENAME, elementCount: -1 },
  })))
})
