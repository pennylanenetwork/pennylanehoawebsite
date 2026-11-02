# Changelog

This file records material changes to the Penny Lane Estates HOA website and portals.

## Unreleased

## 2026-11-01

### Added

- Connected the production QuickBooks Online company through encrypted OAuth credentials.
- Added an owner-only **Dues** tab with the mapped HOA balance, open invoices, Intuit-hosted payment links, and customer-facing product/service descriptions.
- Added automatic QuickBooks synchronization at `00:00` and `12:00` UTC, with **Sync now** retained for immediate updates.
- Added prominent renter badges and renter counts to the administration account and property views.

### Changed

- Granted super administrators and treasurers access to QuickBooks customer synchronization and property mapping.
- Kept QuickBooks connect, reconnect, and disconnect controls restricted to super administrators.
- Centered the QuickBooks payment-button label and improved invoice presentation.
- Displayed database synchronization timestamps in Lindale time.

### Security and privacy

- QuickBooks billing data remains limited to mapped property-owner accounts; renters cannot see owner balances or invoices.
- QuickBooks API routes enforce the same super-administrator and treasurer permissions as the administration interface.
- Intuit payment pages collect payment details; the HOA website does not collect or store residents' card or bank information.

## 2026-10-28

### Added

- Added public privacy and terms pages, QuickBooks data-retention disclosures, incident-response procedures, and a secure Intuit disconnect flow.
- Added QuickBooks synchronization health information and property-to-customer mapping controls.

## 2026-08-28

### Added

- Added production operations documentation, weekly D1 exports, emergency administrative recovery, and automated uptime monitoring.
