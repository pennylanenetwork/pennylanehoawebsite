# Changelog

This file records material changes to the Penny Lane Estates HOA website and portals.

## Unreleased

### Added

- Added automatic Web Push alerts for clubhouse reservation requests, cancellations, and paid deposits to amenities coordinators and super administrators.
- Added routed Web Push alerts for new resident messages and replies, including resident notifications when administrators respond.
- Added voluntary SMS consent during public registration and in resident Communication Preferences, with U.S. phone normalization and timestamped opt-in/opt-out history.
- Added a direct public registration URL for carrier review at `/portal?mode=register`.
- Added resident overview status cards for dues and invoices, clubhouse reservations, guest registrations, pool agreements, messages, and the next community event.
- Added administrator-defined document categories with protected standard categories for Governing Documents, HOA Meeting Agendas, HOA Meeting Minutes, Special Notices, and General records.
- Added resident document-category filtering and organized, category-grouped document lists.
- Added an administration overview metric showing how many active properties have at least one approved resident account, including the resulting adoption percentage.
- Added property-list filters for properties with or without registered accounts while preserving address and resident-name search.

### Changed

- Updated the Privacy Policy and Terms of Service with Twilio-compatible SMS disclosures, no-sharing language, STOP/HELP instructions, and a dedicated SMS Terms section.
- Clarified browser-notification settings to describe resident message alerts and role-based clubhouse administration alerts.
- Reorganized the resident portal into permission-aware Home, Community, Amenities, My Property, Messages, and Account areas with contextual submenus.
- Clarified resident navigation labels for Dues & Invoices, Clubhouse Reservations, Guest Registration, Household Accounts, and Communication Preferences.
- Reorganized the administration navigation into permission-aware top-level areas with contextual submenus for Residents, Communications, Calendar & Amenities, Content, and Finance.
- Clarified administration labels for Clubhouse Reservations, Guests & Pool Access, and the Document Library while preserving existing role permissions.
- Existing document category labels are preserved and imported into the managed category list during migration.
- Updated property summaries and adoption reporting to count approved active accounts separately from pending registration requests.

## 2026-11-02

### Added

- Added an owner-only paid invoice history to the Dues tab covering a rolling 24-month invoice-date window.
- Grouped paid invoices by year while preserving the invoice number, issue and due dates, total, product/service descriptions, and available Intuit invoice link.

### Changed

- Updated QuickBooks synchronization and administration totals to report open and paid invoice snapshots separately.
- Updated QuickBooks retention and operations documentation for the paid invoice history.

## 2026-11-01

### Added

- Added an event list beside the resident month calendar on desktop, with the calendar and list remaining vertically stacked on tablet and mobile.
- Added regression coverage for date-only all-day clubhouse blackouts and timed blackouts longer than 12 hours.
- Connected the production QuickBooks Online company through encrypted OAuth credentials.
- Added an owner-only **Dues** tab with the mapped HOA balance, open invoices, Intuit-hosted payment links, and customer-facing product/service descriptions.
- Added automatic QuickBooks synchronization at `00:00` and `12:00` UTC, with **Sync now** retained for immediate updates.
- Added prominent renter badges and renter counts to the administration account and property views.

### Changed

- Increased the maximum resident and administration workspace width from 1160px to 1440px on large desktop displays.
- Increased portal navigation, form, record, and calendar text sizes for improved readability while preserving the existing mobile layouts.
- Updated all-day clubhouse blackouts to require dates only, include the complete final date, and avoid time-field validation.
- Removed the general 12-hour event-duration limit from administrator-created timed clubhouse blackouts.
- Ignored the local `.tmp` workspace so browser profiles, document extraction files, and other temporary artifacts are not added to Git.
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
