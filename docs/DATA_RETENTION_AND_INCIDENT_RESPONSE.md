# Data Retention and Incident Response Policy

Effective October 28, 2026

This policy applies to the Penny Lane Estates Homeowners Association website, resident portal, administrative portal, and connected services. The board is responsible for reviewing it at least annually and whenever a material service or legal requirement changes.

## Data retention

The HOA keeps information only as long as it is reasonably needed to operate the association, meet accounting and legal obligations, resolve disputes, and preserve required association records. Access is limited by portal role.

| Record | Active retention and disposition |
| --- | --- |
| Resident accounts, property assignments, pool agreements, access cards, and guest records | Retained while needed to administer the property and HOA services. Corrected, deactivated, or deleted by a super administrator when appropriate, except where an association, financial, or legal record must be preserved. |
| Messages, announcements, events, reservations, deposit decisions, and administrative audit records | Retained as HOA operational records until the board authorizes deletion under its records schedule. Super-administrator deletion tools must not be used to remove records subject to a dispute, claim, audit, or legal hold. |
| Uploaded documents and photographs | Retained while published or required as an HOA record. Removing a database record must also remove its private R2 object when the application supports deletion. |
| Login codes and sessions | Login codes expire after 10 minutes. Sessions expire after 7 days. Expired records are removed opportunistically when new codes or sessions are created. |
| QuickBooks OAuth states | Expire after 10 minutes and are removed during later authorization attempts or when QuickBooks is disconnected. |
| QuickBooks tokens, imported customers, balances, and property mappings | Retained only while the QuickBooks connection is active. Disconnecting first revokes authorization with Intuit, then deletes the active connection, encrypted tokens, imported data, and mappings. |
| D1 database backups | Weekly exports in private R2 storage and GitHub Actions artifacts expire after 30 days. The R2 lifecycle rule `Delete database backups after 30 days` must remain enabled. |

Deletion from the active database does not immediately remove a record from an existing encrypted backup. Backup copies age out automatically within 30 days and are used only for disaster recovery. If litigation, a regulatory inquiry, an insurance claim, or another legal hold applies, the board must suspend ordinary deletion for the affected records and document the hold.

## Resident requests and service disconnection

Requests to review, correct, or delete resident information are sent to `board@pennylanehoa.net`. The board verifies the requester's identity and property relationship before making changes. A request may be limited when the HOA must retain an official, financial, safety, contractual, or legal record.

Only a super administrator may disconnect QuickBooks. The procedure in `OPERATIONS.md` must be followed. If Intuit does not confirm token revocation, the website retains the connection and imported data so the administrator can retry without leaving an active authorization untracked.

## Incident response

A security incident includes suspected or confirmed unauthorized access, disclosure, alteration, loss, misuse, malware, credential compromise, or service-provider incident involving the website, resident information, payment information, or QuickBooks data.

### 1. Report and triage

1. Report the incident immediately to the board president and the technical administrator. Do not include passwords, API keys, tokens, or full resident records in ordinary email.
2. Record when the issue was discovered, who reported it, affected systems, observed symptoms, and actions already taken.
3. Treat incidents involving administrator credentials, Cloudflare, GitHub, Stripe, Brevo, or Intuit authorization as high priority until scope is known.

### 2. Contain and preserve evidence

1. Revoke exposed sessions, credentials, API tokens, or OAuth connections; disable affected features when continued operation could increase harm.
2. Preserve relevant Cloudflare logs, GitHub history, audit records, provider event IDs, screenshots, and timestamps before changing or deleting evidence.
3. Do not restore a backup or delete suspected records until the incident lead has preserved the evidence needed to understand the event.

### 3. Assess and notify

1. Determine what data and residents were affected, whether access is ongoing, and whether payment or QuickBooks information was involved.
2. A security incident involving the Intuit platform, application, or QuickBooks user data must be reported to Intuit without undue delay and no later than 24 hours after discovery. The notice must describe the incident, affected data, containment, and planned remediation.
3. The board determines, with legal, insurance, provider, or law-enforcement guidance when appropriate, whether residents or government authorities must be notified. Coordinate any QuickBooks-related notice with Intuit.

### 4. Recover and follow up

1. Remove the cause, rotate affected credentials, patch the application, and validate access controls before restoring normal service.
2. Confirm the public health endpoint, authentication, email, payment webhooks, QuickBooks connection, and a representative resident account after recovery.
3. Keep an incident timeline and decision record. Document affected data, notifications, corrective actions, remaining risks, and the date the incident was closed.
4. Review the incident with the board and update this policy, the runbook, monitoring, or application controls where needed.

## Policy ownership

The board president owns incident coordination unless the board assigns another incident lead. The super administrator performs authorized technical actions. The treasurer participates when financial or QuickBooks records are involved. The secretary maintains the board's incident and policy-review records.
