# Penny Lane HOA Operations Runbook

## Service inventory

- GitHub repository: `pennylanenetwork/pennylanehoawebsite`
- Deployment branch: `main`
- Cloudflare account email: `pennylanenetwork@gmail.com`
- Cloudflare account ID: `f51a0916ea7897787083b4f44e1b1497`
- Worker: `penny-lane-hoa-website`
- D1 database: `penny-lane-hoa` (`6a94dac5-60bb-4704-8e19-f29f46abb779`)
- Private R2 bucket: `penny-lane-hoa-documents`
- Production URL: `https://pennylanehoa.net`
- Health URL: `https://pennylanehoa.net/api/health`
- Staging/fallback URL: `https://penny-lane-hoa-website.plhoa-website.workers.dev`

Do not put API tokens, OAuth secrets, Stripe keys, email credentials, or recovery codes in this repository.

See [`ROLES_AND_NOTIFICATIONS.md`](ROLES_AND_NOTIFICATIONS.md) for the current email-routing and administration-permission matrix.
See [`DATA_RETENTION_AND_INCIDENT_RESPONSE.md`](DATA_RETENTION_AND_INCIDENT_RESPONSE.md) for the board's retention schedule, legal-hold rule, and incident procedure.

## QuickBooks Online balance integration

The QuickBooks integration is read-only. It imports customer display names, active status, current balances, and open invoices, then lets a super administrator map one QuickBooks customer to one HOA property. Only active resident accounts marked as property owners can see the balance and invoices mapped to their property; renters do not receive them. When QuickBooks supplies an eligible hosted invoice link, the resident can open that Intuit page to review or pay the invoice. QuickBooks customer data and property mappings are available only to super administrators.

The production Worker requires these encrypted Cloudflare secrets:

- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_TOKEN_KEY` (a base64-encoded 32-byte AES key)

Never rotate `QUICKBOOKS_TOKEN_KEY` while an OAuth connection is stored. Rotating it makes the stored access and refresh tokens unreadable; reconnect QuickBooks immediately if a rotation is required.

The Intuit app redirect URI must exactly match:

```text
https://pennylanehoa.net/api/admin/quickbooks/callback
```

During testing, `QUICKBOOKS_ENVIRONMENT` is `sandbox` in `wrangler.jsonc` and the Intuit Development credentials must be installed as Worker secrets. A super administrator completes setup from **Administration > QuickBooks**:

1. Select **Connect QuickBooks** and authorize the Intuit sandbox company.
2. Select **Sync now** to import the customer list and balances.
3. Match a test property to its QuickBooks customer.
4. Sign in as an owner for that property and confirm the balance appears on the resident overview.
5. Sign in as a renter and confirm the balance does not appear.

Synchronization is manual during the initial rollout. Selecting **Sync now** refreshes every imported balance and all invoices with a remaining balance. Paid or removed invoices disappear only after a successful synchronization. The administration page records the latest attempt, whether it succeeded or failed, and the last successful synchronization. Residents see the last successful synchronization time and a notice that balances and invoices are not real-time. Mapping changes are recorded in the audit log.

Selecting **Disconnect QuickBooks** requires confirmation and is restricted to super administrators. The Worker first revokes the stored refresh token with Intuit. Only after Intuit confirms revocation does one database batch remove the encrypted OAuth connection, pending OAuth states, imported customers, balances, invoices, payment links, and every property mapping. The action is recorded in the audit log. If Intuit does not confirm revocation, the local connection and data are retained so an administrator can retry safely.

Before switching to the live QuickBooks company:

1. Complete Intuit's production app requirements and add the same redirect URI under the Production configuration.
2. Replace the two QuickBooks Worker secrets with the Production Client ID and Client Secret.
3. Change `QUICKBOOKS_ENVIRONMENT` in `wrangler.jsonc` from `sandbox` to `production` and deploy.
4. Connect the live HOA company, synchronize, and verify one mapping before mapping the remaining properties.
5. Confirm balances with the treasurer before announcing resident access.

## Deployment ownership and verification

Cloudflare Workers Builds is expected to deploy every push to `main`. Manual deployments use the same Worker configuration through `npm run cf:deploy`.

Verified on August 28, 2026:

- The Git remote points to the correct `pennylanenetwork` GitHub organization and repository.
- Wrangler is authenticated as `pennylanenetwork@gmail.com` in the Cloudflare account listed above.
- The live D1 database ID matches `wrangler.jsonc`.
- Each manual deployment followed by a `main` push produced a second Cloudflare deployment about 35-45 seconds later, confirming that the Git-triggered build path is active.

After changing GitHub or Cloudflare ownership, confirm both sides:

1. In Cloudflare, open **Workers & Pages > penny-lane-hoa-website > Settings > Builds**.
2. Confirm the repository is `pennylanenetwork/pennylanehoawebsite`, the production branch is `main`, and the deploy command is `npx wrangler deploy`.
3. Select **Manage** and confirm the installed GitHub account or organization is `pennylanenetwork`.
4. In GitHub organization settings, open **GitHub Apps** and confirm the Cloudflare Workers/Pages installation can access this repository.
5. Push a documentation-only commit and confirm the Cloudflare build succeeds and its deployed commit matches GitHub `main`.

## D1 backup and recovery

D1 Time Travel is automatic and requires no scheduled job. Use it for recent point-in-time recovery. The weekly `D1 backup` GitHub workflow runs early Monday morning, exports the complete schema and data to the private R2 prefix `database-backups/`, and retains a GitHub artifact for 30 days. The R2 prefix has a Cloudflare lifecycle rule named `Delete database backups after 30 days`; do not remove it without updating the public privacy policy and board retention policy. A full D1 export can briefly pause database queries, which is why it is scheduled during low-traffic hours.

To activate the workflow, add these GitHub Actions repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`: the account ID listed above.
- `CLOUDFLARE_API_TOKEN`: a dedicated token limited to this account with D1 Edit and Workers R2 Storage Edit permissions.

Run the workflow manually once from **GitHub > Actions > D1 backup > Run workflow** and verify the resulting object under **R2 > penny-lane-hoa-documents > database-backups**. Review failed scheduled workflows promptly.

The export process was verified manually on August 28, 2026. It created `database-backups/penny-lane-hoa-2026-08-28T19-47-49Z.sql` in the private R2 bucket.

Before any restore, export the current database and record the Time Travel bookmark. A Time Travel restore overwrites the live database:

```sh
npx wrangler d1 time-travel info penny-lane-hoa
npx wrangler d1 export penny-lane-hoa --remote --output=before-restore.sql
npx wrangler d1 time-travel restore penny-lane-hoa --timestamp="2026-08-28T12:00:00Z"
```

For an older R2 SQL export, download it privately and restore only during a planned maintenance window after verifying the file and taking a current export.

## Emergency administrative access

At least two current board officers should have access to the board-controlled GitHub and Cloudflare accounts, with MFA and recovery codes stored in the board's approved password manager. Do not share one person's MFA method.

Preferred recovery:

1. Another super administrator signs in and promotes or reactivates the board member from **Administration > Accounts**.
2. Confirm the recovered member can sign in before ending the recovery session.
3. Review the account and audit history for unexpected changes.

If no super administrator can sign in:

1. Obtain authorization from two board officers and record the reason and affected email address.
2. Sign in to the correct Cloudflare account and open **D1 > penny-lane-hoa > Console**.
3. Confirm the person already submitted a resident registration and that the email and property are correct.
4. Run the narrowly scoped update below, replacing the email address:

```sql
UPDATE users
SET role = 'super_admin', status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = lower('board.member@example.com');
```

5. Confirm exactly one row changed. If zero rows changed, stop; do not create an account directly in SQL. Have the member submit a registration request first.
6. Have the member sign in, inspect the Accounts page, and restore the intended administrator assignments.
7. Record the emergency change in board records and rotate credentials if account compromise was suspected.

## Monitoring and incident checks

The `Website health` GitHub workflow checks the public homepage and D1-backed `/api/health` endpoint every 15 minutes. A failure appears as a failed GitHub Actions run; board maintainers should enable GitHub Actions failure notifications.

Cloudflare Worker observability is enabled in `wrangler.jsonc`. For application errors, open **Workers & Pages > penny-lane-hoa-website > Observability > Logs** and filter for errors or the structured `Unhandled API error` message. Also configure a Cloudflare notification for elevated Worker error rate if that notification type is available on the account.

The uptime workflow monitors `https://pennylanehoa.net/` and `https://pennylanehoa.net/api/health`. The `workers.dev` hostname remains enabled as a staging and emergency fallback endpoint.
