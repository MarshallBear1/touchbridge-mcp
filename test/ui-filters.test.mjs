import test from 'node:test'
import assert from 'node:assert/strict'
import { applyScanUiFilters } from '../dist/ui-filters.js'

const elements = [
  { type: 'Button', AXLabel: 'Continue', frame: { x: 10, y: 20, width: 100, height: 40 } },
  { type: 'Button', AXLabel: 'Continue', frame: { x: 10, y: 20, width: 100, height: 40 } },
  { type: 'Button', AXLabel: 'Later', frame: { x: 10, y: 900, width: 100, height: 40 } },
  { type: 'StaticText', AXLabel: 'Welcome', frame: { x: 10, y: 80, width: 100, height: 20 } },
  { type: 'Other', frame: { x: 0, y: 0, width: 393, height: 852 } },
]

test('scan filters deduplicate and return visible interactive elements', () => {
  assert.deepEqual(applyScanUiFilters(elements, 393, 852).elements, [elements[0]])
})

test('scan query reports off-screen interactive matches', () => {
  const result = applyScanUiFilters(elements, 393, 852, 'Later')
  assert.deepEqual(result.elements, [elements[2]])
  assert.match(result.warning ?? '', /off-screen/)
})

test('scan query can return visible non-interactive text', () => {
  const result = applyScanUiFilters(elements, 393, 852, 'Welcome')
  assert.deepEqual(result.elements, [elements[3]])
})
