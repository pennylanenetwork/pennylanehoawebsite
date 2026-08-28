import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessMessage, canManageDeposits, canManageReservations } from '../worker/index.js'

const user = (fields = {}) => ({
  role: 'admin',
  isBoardMember: false,
  isAccMember: false,
  isTreasurer: false,
  isAmenitiesCoordinator: false,
  ...fields,
})

test('super administrators can access every routed message category', () => {
  const superAdmin = user({ role: 'super_admin' })
  for (const category of ['general', 'maintenance', 'board', 'architectural', 'treasurer', 'amenities']) {
    assert.equal(canAccessMessage(superAdmin, category), true)
  }
})

test('board members can access only board-routed categories', () => {
  const boardMember = user({ isBoardMember: true })
  for (const category of ['general', 'maintenance', 'board']) assert.equal(canAccessMessage(boardMember, category), true)
  for (const category of ['architectural', 'treasurer', 'amenities']) assert.equal(canAccessMessage(boardMember, category), false)
})

test('committee and coordinator assignments stay isolated', () => {
  const assignments = [
    ['architectural', 'isAccMember'],
    ['treasurer', 'isTreasurer'],
    ['amenities', 'isAmenitiesCoordinator'],
  ]
  for (const [allowedCategory, flag] of assignments) {
    const assigned = user({ [flag]: true })
    for (const category of ['general', 'maintenance', 'board', 'architectural', 'treasurer', 'amenities']) {
      assert.equal(canAccessMessage(assigned, category), category === allowedCategory)
    }
  }
})

test('an unassigned administrator cannot access routed conversations', () => {
  const administrator = user()
  for (const category of ['general', 'maintenance', 'board', 'architectural', 'treasurer', 'amenities']) {
    assert.equal(canAccessMessage(administrator, category), false)
  }
})

test('reservation approval is available to administrators and amenities coordinators', () => {
  assert.equal(canManageReservations(user({ role: 'admin' })), true)
  assert.equal(canManageReservations(user({ role: 'super_admin' })), true)
  assert.equal(canManageReservations(user({ role: 'resident', isAmenitiesCoordinator: true })), true)
  assert.equal(canManageReservations(user({ role: 'resident', isTreasurer: true })), false)
  assert.equal(canManageReservations(user({ role: 'resident' })), false)
})

test('deposit decisions are limited to the three assigned authorities', () => {
  assert.equal(canManageDeposits(user({ role: 'super_admin' })), true)
  assert.equal(canManageDeposits(user({ role: 'resident', isAmenitiesCoordinator: true })), true)
  assert.equal(canManageDeposits(user({ role: 'resident', isTreasurer: true })), true)
  assert.equal(canManageDeposits(user({ role: 'admin' })), false)
  assert.equal(canManageDeposits(user()), false)
})
