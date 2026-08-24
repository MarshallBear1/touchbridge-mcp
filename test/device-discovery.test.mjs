import test from 'node:test'
import assert from 'node:assert/strict'
import { hasInstalledWdaRunner, parseDevicectlDevice } from '../dist/wda/device-discovery.js'

function record(overrides = {}) {
  return {
    identifier: 'device-1',
    hardwareProperties: {
      platform: 'iOS',
      marketingName: 'iPhone Test',
      udid: '00008100-TEST',
    },
    connectionProperties: {
      pairingState: 'paired',
      transportType: 'localNetwork',
      tunnelState: 'connected',
    },
    deviceProperties: {
      bootState: 'booted',
      developerModeStatus: 'enabled',
      name: 'QA iPhone',
    },
    ...overrides,
  }
}

test('parseDevicectlDevice keeps a currently connected iOS device', () => {
  assert.deepEqual(parseDevicectlDevice(record()), {
    udid: '00008100-TEST',
    name: 'QA iPhone',
    model: 'iPhone Test',
    connectionType: 'wifi',
    paired: true,
    developerModeEnabled: true,
    wdaInstalled: false,
    wdaRunning: false,
  })
})

test('parseDevicectlDevice accepts booted wired devices', () => {
  const parsed = parseDevicectlDevice(record({
    connectionProperties: { transportType: 'wired', tunnelState: 'disconnected' },
    deviceProperties: { bootState: 'booted', name: 'USB iPad' },
  }))
  assert.equal(parsed?.connectionType, 'usb')
  assert.equal(parsed?.name, 'USB iPad')
})

test('parseDevicectlDevice rejects historical paired devices without present connection evidence', () => {
  for (const tunnelState of ['unavailable', 'disconnected', undefined]) {
    const parsed = parseDevicectlDevice(record({
      connectionProperties: { pairingState: 'paired', tunnelState },
      deviceProperties: { bootState: null },
    }))
    assert.equal(parsed, null)
  }
})

test('parseDevicectlDevice rejects non-mobile Apple platforms and malformed records', () => {
  assert.equal(parseDevicectlDevice(record({
    hardwareProperties: { platform: 'macOS', udid: 'mac' },
  })), null)
  assert.equal(parseDevicectlDevice({ hardwareProperties: { platform: 'iOS' } }), null)
  assert.equal(parseDevicectlDevice(null), null)
})

test('hasInstalledWdaRunner distinguishes installed runner apps from ordinary apps', () => {
  assert.equal(hasInstalledWdaRunner([
    { name: 'Juno', bundleIdentifier: 'com.example.juno' },
    { name: 'WebDriverAgentRunner-Runner', bundleIdentifier: 'com.example.wda.xctrunner' },
  ]), true)
  assert.equal(hasInstalledWdaRunner([
    { name: 'Juno', bundleIdentifier: 'com.example.juno' },
  ]), false)
  assert.equal(hasInstalledWdaRunner(null), false)
})
