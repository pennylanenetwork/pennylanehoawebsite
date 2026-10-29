import assert from 'node:assert/strict'
import test from 'node:test'
import { isRetryableIntuitStatus, normalizeQuickBooksInvoice } from '../worker/index.js'

test('normalizes an open QuickBooks invoice for storage', () => {
  const invoice = normalizeQuickBooksInvoice({
    Id: '238',
    DocNumber: '1069',
    TxnDate: '2026-07-24',
    DueDate: '2026-08-23',
    TotalAmt: 125,
    Balance: 100,
    CustomerRef: { value: '42' },
    InvoiceLink: 'https://connect.intuit.com/pay/example',
    AllowOnlineACHPayment: true,
    AllowOnlineCreditCardPayment: false,
  }, 'sync-1')

  assert.deepEqual(invoice, {
    id: '238',
    customerId: '42',
    documentNumber: '1069',
    transactionDate: '2026-07-24',
    dueDate: '2026-08-23',
    totalAmount: 125,
    balance: 100,
    invoiceLink: 'https://connect.intuit.com/pay/example',
    allowOnlineAch: true,
    allowOnlineCard: false,
    syncRunId: 'sync-1',
  })
})

test('excludes paid or incomplete invoices from the open invoice snapshot', () => {
  assert.equal(normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 0, CustomerRef: { value: '2' },
  }, 'sync-1'), null)
  assert.equal(normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 100,
  }, 'sync-1'), null)
})

test('stores only HTTPS invoice links hosted by Intuit', () => {
  const invoice = normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 100,
    CustomerRef: { value: '2' }, InvoiceLink: 'javascript:alert(1)',
  }, 'sync-1')
  assert.equal(invoice.invoiceLink, null)
  const external = normalizeQuickBooksInvoice({
    Id: '2', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 100,
    CustomerRef: { value: '2' }, InvoiceLink: 'https://example.com/pay',
  }, 'sync-1')
  assert.equal(external.invoiceLink, null)
})

test('retries only transient Intuit response statuses', () => {
  assert.equal(isRetryableIntuitStatus(429), true)
  assert.equal(isRetryableIntuitStatus(500), true)
  assert.equal(isRetryableIntuitStatus(503), true)
  assert.equal(isRetryableIntuitStatus(400), false)
  assert.equal(isRetryableIntuitStatus(401), false)
})
