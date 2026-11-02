import assert from 'node:assert/strict'
import test from 'node:test'
import { isRetryableIntuitStatus, normalizeQuickBooksInvoice, quickBooksAdminRedirectUrl, quickBooksPaidInvoiceCutoff } from '../worker/index.js'

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
    Line: [
      { DetailType: 'SalesItemLineDetail', Description: '2027 annual assessment', SalesItemLineDetail: { ItemRef: { name: 'HOA Dues' } } },
      { DetailType: 'SubTotalLineDetail', Amount: 125 },
    ],
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
    lineItems: [{ name: 'HOA Dues', description: '2027 annual assessment' }],
    status: 'open',
    syncRunId: 'sync-1',
  })
})

test('keeps only customer-facing QuickBooks sales lines', () => {
  const invoice = normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 100, CustomerRef: { value: '2' },
    Line: [
      { DetailType: 'SalesItemLineDetail', Description: '  Annual   dues  ', SalesItemLineDetail: { ItemRef: { name: 'Assessment' } } },
      { DetailType: 'SalesItemLineDetail', Description: 'Late fee', SalesItemLineDetail: {} },
      { DetailType: 'DescriptionOnlyLine', Description: 'Internal note' },
      { DetailType: 'SubTotalLineDetail', Amount: 100 },
    ],
  }, 'sync-1')
  assert.deepEqual(invoice.lineItems, [
    { name: 'Assessment', description: 'Annual dues' },
    { name: null, description: 'Late fee' },
  ])
})

test('keeps paid invoices in the paid snapshot', () => {
  const invoice = normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', DueDate: '2026-01-31', TotalAmt: 100, Balance: 0,
    CustomerRef: { value: '2' },
  }, 'sync-1', 'paid')
  assert.equal(invoice.status, 'paid')
  assert.equal(invoice.balance, 0)
  assert.equal(invoice.totalAmount, 100)
})

test('excludes invoices with balances that do not match the snapshot status', () => {
  assert.equal(normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 0, CustomerRef: { value: '2' },
  }, 'sync-1'), null)
  assert.equal(normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 25, CustomerRef: { value: '2' },
  }, 'sync-1', 'paid'), null)
  assert.equal(normalizeQuickBooksInvoice({
    Id: '1', TxnDate: '2026-01-01', TotalAmt: 100, Balance: 100,
  }, 'sync-1'), null)
})

test('uses a rolling 24-month invoice-date cutoff', () => {
  assert.equal(quickBooksPaidInvoiceCutoff(new Date('2026-11-02T18:00:00.000Z')), '2024-11-02')
  assert.equal(quickBooksPaidInvoiceCutoff(new Date('2024-02-29T12:00:00.000Z')), '2022-02-28')
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

test('builds an absolute QuickBooks callback redirect for Cloudflare Workers', () => {
  assert.equal(
    quickBooksAdminRedirectUrl('https://pennylanehoa.net/api/admin/quickbooks/callback?code=example', 'connected'),
    'https://pennylanehoa.net/admin?tab=quickbooks&quickbooks=connected',
  )
})
