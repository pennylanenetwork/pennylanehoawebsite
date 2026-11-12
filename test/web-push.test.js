import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanWebPushDestination, isAllowedPushEndpoint, messagePushRecipientCondition, reservationManagerPushCondition, webPushAudienceCondition } from '../worker/index.js'

test('accepts the supported browser push services', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true)
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true)
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/Q/example'), true)
})

test('rejects unsafe or unrelated push endpoints', () => {
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/example'), false)
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.test/example'), false)
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1/internal'), false)
  assert.equal(isAllowedPushEndpoint('not a url'), false)
})

test('maps only supported Web Push audiences to fixed SQL conditions', () => {
  assert.equal(webPushAudienceCondition('owners'), "users.resident_type = 'owner'")
  assert.equal(webPushAudienceCondition('renters'), "users.resident_type = 'tenant'")
  assert.equal(webPushAudienceCondition('board'), 'users.is_board_member = 1')
  assert.equal(webPushAudienceCondition('acc'), 'users.is_acc_member = 1')
  assert.equal(webPushAudienceCondition('unexpected'), '1 = 1')
})

test('allows only internal notification destinations', () => {
  assert.equal(cleanWebPushDestination('/portal?tab=calendar'), '/portal?tab=calendar')
  assert.throws(() => cleanWebPushDestination('https://example.com'))
  assert.throws(() => cleanWebPushDestination('//example.com'))
  assert.throws(() => cleanWebPushDestination('/portal#section'))
})

test('reservation push alerts target only the amenities coordinator and super administrator', () => {
  assert.equal(reservationManagerPushCondition(), "users.role = 'super_admin' OR users.is_amenities_coordinator = 1")
})

test('message push alerts follow category routing', () => {
  assert.equal(messagePushRecipientCondition('general'), "users.is_board_member = 1 OR users.role = 'super_admin'")
  assert.equal(messagePushRecipientCondition('maintenance'), "users.is_board_member = 1 OR users.role = 'super_admin'")
  assert.equal(messagePushRecipientCondition('board'), "users.is_board_member = 1 OR users.role = 'super_admin'")
  assert.equal(messagePushRecipientCondition('architectural'), "users.is_acc_member = 1 OR users.role = 'super_admin'")
  assert.equal(messagePushRecipientCondition('treasurer'), "users.is_treasurer = 1 OR users.role = 'super_admin'")
  assert.equal(messagePushRecipientCondition('amenities'), "users.is_amenities_coordinator = 1 OR users.role = 'super_admin'")
})
