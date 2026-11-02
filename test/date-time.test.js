import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateTime, normalizeTimestamp } from '../src/dateTime.js'

test('treats timezone-less database timestamps as UTC', () => {
  assert.equal(normalizeTimestamp('2026-11-02 01:39:00'), '2026-11-02T01:39:00Z')
  assert.equal(formatDateTime('2026-11-02 01:39:00'), 'Nov 1, 2026, 7:39 PM')
})

test('preserves timestamps that already include a timezone', () => {
  assert.equal(normalizeTimestamp('2026-11-02T01:39:00Z'), '2026-11-02T01:39:00Z')
})
