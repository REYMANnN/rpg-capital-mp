import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInviteCreate, parseStaffCreate, parseStaffLogin, parseStoreCreate } from '../../lib/accounts/payloads'

test('staff creation requires a name, valid role and 4 digit PIN', () => {
  assert.equal(parseStaffCreate({ storeId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', displayName: 'Carlos', role: 'cashier', pin: '4821' }).success, true)
  assert.equal(parseStaffCreate({ storeId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', displayName: 'Carlos', role: 'cashier', pin: '48' }).success, false)
})

test('device invitation requires an authorized store and readable name', () => {
  assert.equal(parseInviteCreate({ storeId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', displayName: 'Caixa 1' }).success, true)
  assert.equal(parseInviteCreate({ storeId: 'bad', displayName: '' }).success, false)
})

test('staff login accepts only uuid plus 4 digit PIN', () => {
  assert.equal(parseStaffLogin({ staffId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', pin: '4821' }).success, true)
  assert.equal(parseStaffLogin({ staffId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', pin: 'abcd' }).success, false)
})

test('store creation validates basic address fields', () => {
  assert.equal(parseStoreCreate({ businessId: '8c1eb842-e83c-4a96-b469-3b03461a8f51', displayName: 'Loja Centro', businessType: 'mercadinho', cep: '12240000', street: 'Rua A', number: '10', city: 'São José dos Campos', state: 'SP' }).success, true)
  assert.equal(parseStoreCreate({ businessId: 'bad', displayName: 'X', businessType: 'mercadinho', cep: '1', street: '', number: '', city: '', state: 'S' }).success, false)
})
