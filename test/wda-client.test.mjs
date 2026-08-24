import test from 'node:test'
import assert from 'node:assert/strict'
import { UnsupportedOperationError, WDAClient } from '../dist/wda/wda-client.js'

const client = WDAClient.getInstance('physical-test-device')

test('WDA XML hit-testing uses parsed frames and returns the smallest matching element', () => {
  const xml = `
    <XCUIElementTypeApplication type="XCUIElementTypeApplication" name="App" label="" x="0" y="0" width="393" height="852" enabled="true" visible="true">
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="Continue" label="Continue" x="20" y="100" width="160" height="48" enabled="true" visible="true"/>
      <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" name="Continue label" label="Continue" x="36" y="112" width="100" height="20" enabled="true" visible="true"/>
    </XCUIElementTypeApplication>
  `

  const elements = client.parseAccessibilityXml(xml, true)
  assert.deepEqual(client.findElementAtPoint(elements, 50, 120), {
    type: 'StaticText',
    AXLabel: 'Continue',
    AXValue: null,
    title: 'Continue label',
    frame: { x: 36, y: 112, width: 100, height: 20 },
    AXUniqueId: null,
    enabled: true,
    visible: true,
  })
  assert.equal(client.findElementAtPoint(elements, 500, 500), null)
})

test('physical numeric HID actions fail explicitly instead of reporting false success', async () => {
  await assert.rejects(client.pressKey(40), UnsupportedOperationError)
  await assert.rejects(client.pressKeySequence(['a', 40]), UnsupportedOperationError)
})
