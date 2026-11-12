import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSmsPhone } from '../worker/index.js'

test('normalizes common U.S. mobile number formats for SMS delivery', () => {
  assert.equal(normalizeSmsPhone('(903) 555-0123'), '+19035550123')
  assert.equal(normalizeSmsPhone('1-903-555-0123'), '+19035550123')
  assert.equal(normalizeSmsPhone('+1 903 555 0123'), '+19035550123')
})

test('rejects incomplete or non-U.S. SMS numbers', () => {
  assert.equal(normalizeSmsPhone('903-555-012'), null)
  assert.equal(normalizeSmsPhone('+44 20 7946 0958'), null)
  assert.equal(normalizeSmsPhone(''), null)
})
