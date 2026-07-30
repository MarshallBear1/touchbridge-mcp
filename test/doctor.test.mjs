import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDoctorChecks } from '../dist/doctor.js'

test('summarizeDoctorChecks counts diagnostic severities', () => {
  const checks = [
    { id: 'a', status: 'pass', message: 'ok' },
    { id: 'b', status: 'pass', message: 'ok' },
    { id: 'c', status: 'warn', message: 'optional' },
    { id: 'd', status: 'fail', message: 'required' },
  ]
  assert.deepEqual(summarizeDoctorChecks(checks), { pass: 2, warn: 1, fail: 1 })
})
