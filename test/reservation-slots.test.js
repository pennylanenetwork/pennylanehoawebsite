import assert from 'node:assert/strict'
import test from 'node:test'
import { allDayBlackoutRange, reservationSlotRange } from '../worker/index.js'

const settings = { opensAt: '08:00', closesAt: '23:00', cleanupBufferMinutes: 60 }

test('half-day slots use Lindale time and preserve the cleanup hour', () => {
  const first = reservationSlotRange('2030-01-15', 'first_half', settings)
  const second = reservationSlotRange('2030-01-15', 'second_half', settings)

  assert.deepEqual(first, { startsAt: '2030-01-15T14:00:00.000Z', endsAt: '2030-01-15T21:00:00.000Z' })
  assert.deepEqual(second, { startsAt: '2030-01-15T22:00:00.000Z', endsAt: '2030-01-16T05:00:00.000Z' })
})

test('whole-day slots follow daylight-saving time in Lindale', () => {
  assert.deepEqual(reservationSlotRange('2030-07-15', 'whole_day', settings), {
    startsAt: '2030-07-15T13:00:00.000Z',
    endsAt: '2030-07-16T04:00:00.000Z',
  })
})

test('all-day blackouts include the selected final date in Lindale', () => {
  assert.deepEqual(allDayBlackoutRange('2030-07-15', '2030-07-15'), {
    startsAt: '2030-07-15T05:00:00.000Z',
    endsAt: '2030-07-16T05:00:00.000Z',
  })
  assert.deepEqual(allDayBlackoutRange('2030-01-15', '2030-01-17'), {
    startsAt: '2030-01-15T06:00:00.000Z',
    endsAt: '2030-01-18T06:00:00.000Z',
  })
})
