# Current-essay monetization release — 6 October 2026

A learner who upgrades from a newly saved free Writing diagnostic can now open the full feedback for that same essay. No second submission, model call, or scoring allowance is required to unlock it. Prices, free samples, paid caps, pass duration, and Speaking behavior are unchanged.

## Included

- Full Writing result stored separately from client-readable scores. The report table has RLS, no browser grants or policies, and service-role-only access.
- Account-owned report API, saved-report library linked from the dashboard, safe UUID return paths through checkout, and report ownership verified before creating a Stripe session.
- Free reports still contain the overall band, all four criteria and one correction. Locked content is removed on the server. A persistence failure returns the useful diagnostic without advertising a current-report purchase.
- `current_report_v4` offer label only where a valid report was saved. Existing Speaking and older Writing flows retain `locked_value_v3`. These are sequential release labels, not randomized groups.
- Full report links into an editable draft with the original task and question. Revision handoff never auto-submits. The API checks the original report belongs to the account before consuming quota. Scored revisions have a server-side parent reference.
- Seven selected Writing guides link to the relevant Task 2, Academic Task 1 or General Training letter checker. Existing article content remains accessible. Exposure/click events use `current_report_entry_v1`.
- Saved reports contain a useful three-step practice plan and a link to existing optional email preferences. No new email sequence, subscription, default consent or sending gate is introduced. Existing Writing paywall email copy correctly distinguishes the free four-criterion diagnostic from full paid feedback.
- Acquisition grouping uses domain boundaries; `chatgpt.com` no longer matches a wildcard `t.co` social pattern. Historical checkpoint artifacts remain unchanged. The updated report exports corrected source cohorts.

## Access and retention contract

Only a verified, linked account can open its own report. A free report remains reduced on GET. POST checks current server-side Pro entitlement before the first unlock; concurrent/repeated opens have no financial or quota side effect. Expired passes and paused accounts cannot unlock a new report.

Previously unlocked feedback remains in the owner's account history after expiry, cancellation or refund, just as already delivered scores can be retained. This grants neither new scoring nor new report unlocks. Deleting the account cascades to reports. No historical free report is reconstructed or retroactively charged. Old free samples without a saved-report link cannot be expanded.

`first_opened_at` is an operational timestamp meaning the server prepared a full response (including the initial full paid score response). It is not proof that the browser received or the learner read it. The consent-gated `writing_report_open` event is a separate client signal; missing analytics consent is not a failure to deliver.

## Validation

- `TZ=UTC npm test`: 198 test files passed; 2,197 tests passed, 2 skipped. Includes ownership, free-content withholding, stale account responses, no auto-submit on revision, expired/paused entitlement, persistence failure, checkout report ownership, safe returns, replay, source classification, and mature delivery windows.
- `npm run lint`: no errors; existing Speaking examiner hook warning remains.
- Final production build passed after the checkout ownership guard.
- Migration rehearsal against the actual database rolled back all schema and synthetic data. Real anon/authenticated SELECT attempts were rejected. Service role, owner filters, replay, and account deletion cascade passed. The isolated migration was then applied and verified; unrelated pending migrations were not run.
- Real bearer-token requests through the local app passed free preview, forbidden free unlock, direct-table rejection, premium unlock, stable replay timestamps and retained historical access. The disposable synthetic account and reports were deleted. No customer account, real payment, scoring API call or customer email was used for QA.
- Contextual pricing inspected in the browser with no client errors.
- Existing unrelated checks: three sitemap tests fail in Africa/Cairo but pass under UTC; analytics audit flags the existing GlobeStage pointer handler. No new uncaptured handler or parse error.

## Release / rollback

The migration is `20261006104030_durable_writing_reports.sql`. `node scripts/apply-writing-reports.mjs` rehearses and rolls back by default; `--apply` commits only this migration after checks and records its history when the history table exists. Do not run all pending migrations: that would also change separate free-access/pass experiments.

Deploy this commit after the migration. On a critical defect, revert the application commit and keep the private report table/data. Do not drop learner reports. If an earlier app is temporarily restored, its older offers remain honest but saved-report routes are unavailable until recovery; prioritize restoring existing paid report access.

## Measurement

Use the existing read-only `scripts/report-paid-funnel.mjs` with fixed UTC end date and maintained private user/anonymous exclusion files. It now includes `current_report_v4`, corrected consent-limited source cohorts, saved-report diagnostics, and `paidWritingDelivery`.

Delivery counts only positive-value live Checkout sessions with an applied fulfillment belonging to the same user. Its 24-hour and 7-day denominators include only mature windows. Full-report timestamps and revisions are bounded by the recorded paid-access/revocation window. Revisions must reference a delivered report. The first complete observation day is 7 October UTC; the partial release day is deliberately omitted. Earlier delivery windows return unavailable rather than zero. Counts are checkouts, including repeat buyers, not distinct new customers. Reports before this storage release are unobservable, not failed deliveries. Source groups can overlap and must not be summed as unique traffic.

Hold the initial bundle stable for at least 28 days. Retain the audit's minimum evidence gates: 100 eligible scored-offer learners, 20 matured real checkouts and preferably 10 new buyers. These are interpretability gates, not statistical significance. Compare net contribution only after reconciling refunds, fees and cost completeness; existing gross revenue is not contribution.

Stop for incorrect charges, lost access, paid-report failure or a consent regression. Do not optimize against clicks alone or infer uplift from a few purchases.

## Separate follow-up

Existing billing exceptions from the private audit remain a separate reconciliation. This release does not change any existing customer entitlement or Stripe subscription. Single-report pricing and human-review pilots remain conditional on the agreed evidence and fulfillment checks. No price experiment or 28-day monitoring automation was started by this release.
