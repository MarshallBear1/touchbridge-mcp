import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actionBatchSchema,
  describeAfterSchema,
  inputTextParamsSchema,
  keySequenceParamsSchema,
  summarizeKeyAction,
  summarizeKeySequence,
  tapParamsSchema,
} from '../dist/action-validation.js'

test('action schemas reject unsafe numeric and payload bounds', () => {
  assert.equal(tapParamsSchema.safeParse({ x: Number.NaN, y: 10 }).success, false)
  assert.equal(tapParamsSchema.safeParse({ x: -1, y: 10 }).success, false)
  assert.equal(tapParamsSchema.safeParse({ x: 10, y: 10, duration: 31 }).success, false)
  assert.equal(inputTextParamsSchema.safeParse({ text: 'x'.repeat(10_001) }).success, false)
  assert.equal(keySequenceParamsSchema.safeParse({ keySequence: [] }).success, false)
  assert.equal(keySequenceParamsSchema.safeParse({ keySequence: Array(257).fill('a') }).success, false)
  assert.equal(describeAfterSchema.safeParse({ delay: 500 }).success, false)
  assert.equal(describeAfterSchema.safeParse({ all: true, delay: 10_001 }).success, false)
})

test('action batch requires a bounded non-empty sequence', () => {
  const action = { action: 'tap', params: { x: 1, y: 2 } }
  assert.equal(actionBatchSchema.safeParse([]).success, false)
  assert.equal(actionBatchSchema.safeParse([action]).success, true)
  assert.equal(actionBatchSchema.safeParse(Array(101).fill(action)).success, false)
})

test('key result summaries never echo text values', () => {
  const secret = 'private-value'
  const single = summarizeKeyAction(secret)
  const sequence = summarizeKeySequence(['p', 'a', 40, 'ss'])

  assert.doesNotMatch(single, new RegExp(secret))
  assert.match(single, /13 character\(s\).*redacted/)
  assert.doesNotMatch(sequence, /pass/)
  assert.match(sequence, /4 text character\(s\) redacted, 1 HID keycode/)
})
