# Paid funnel measurement contract

Prices and free allowances are unchanged. The offer is a single sequential rollout, not an A/B experiment. Evaluate operational health before interpreting conversion movement.

## Sources and privacy

- Stripe Checkout Sessions: created session and completed positive-value payment facts. Invoice renewals are not purchases in this funnel.
- `billing_checkout_fulfillments`: atomic `applied` activation and first fulfillment timestamp. A paid session without that receipt is a reconciliation exception, not an assumed activation. Historical pre-cutover activation cannot be reconstructed reliably.
- `attempts` and `scores`: persisted completion timestamps only; no answers, essays, feedback, recordings, grades, or contact details are selected for the report.
- `activity_events`: `checkout_session_created` and `checkout_session_failed` with `source=billing_checkout` are operational diagnostics. They store only user billing identity, SKU, bounded failure stage, and session/request key. A diagnostic write failure must not break checkout; Stripe remains created-session truth.
- `exam_pass_offer_view` and `exam_pass_offer_click` remain optional, consent-limited browser analytics. Their reach is reported separately and must not be interpreted as complete operational coverage.

The existing activation/purchase webhook records already cover paid entitlement activation; no duplicate behavioral event or new table is needed. First completed practice is derived from operational persistence after activation, within fourteen days and before a recorded pass expiry or purchase revocation. It demonstrates a buyer returning to practice, not necessarily consumption of a paid allowance. Only activations with fourteen complete follow-up days enter the first-practice rate.

## Denominator and revenue

An eligible learner is a current non-anonymous account that completed persisted practice during the window before its first recorded positive-value Checkout purchase. This reproducible denominator covers authenticated active learners, not all visitors, all registered accounts, or verified offer exposure. An account currently verified may have practised anonymously historically.

Report complete trailing 14-day and 28-day UTC windows, ending at midnight. Gross collected revenue per eligible learner includes positive-value **first** Checkout activations among that same denominator. Keep currencies separate (USD is the advertised catalog currency), with no exchange-rate assumptions. Report repeat purchases and zero-value activations separately; exclude explicit QA identities and recurring renewals. Unknown internal accounts and manual/non-Checkout purchase history remain limitations. Existing customer classification includes prior positive-value Checkout and paid invoice history mapped by exact Stripe customer identity. Off-Stripe/manual payments remain outside that history.

Gross collected revenue is not net revenue or profit. The script separately checks exact payment-intent/invoice-linked charge refunds/disputes in the reporting window. Missing charge links and refunds on older charges require separate reconciliation; no unverified net-revenue number is fabricated.

## Reproduction

```sh
node scripts/report-paid-funnel.mjs --read-only \
  --end=2026-09-06 \
  --exclusions=/private/path/qa-user-ids.json \
  --output=/private/path/paid-funnel-report.json
```

The exclusions file is a JSON array of UUIDs and must stay outside the repository. Alternatively set `FUNNEL_QA_USER_IDS_JSON`; the locally approved audit account is also excluded when its private fixture file exists. The script uses `BEGIN READ ONLY`, rolls back, makes only Stripe list requests, enforces a pagination cap that fails instead of truncating, and outputs only aggregates. Credentials come from local environment/configuration and are never printed. Dates and exclusions must be fixed when comparing saved runs.

Baseline aggregates are private operational reports and must not be committed to a public repository. Empty new diagnostics/exposure events before deployment do not prove an absence of errors or views.

Operational failures cover rate limiting, catalog validation, coupon validation, customer creation/linking, and session creation after authenticated checkout eligibility. Invalid authentication, invalid SKU, anonymous users, already-owned plans and winback eligibility rejections are not classified as provider checkout failures. Provider payment failures after session creation require Stripe payment-event reconciliation; a session created successfully is not a payment success.

The ordered observed offer path is a separate signed-in, consent-limited subset: prior completed AI score (including a mirrored estimator result), observed offer view, later click, later Exam Pass session, and an exact positive-value activation receipt. It does not stitch anonymous identities, establish causation, or replace the operational eligible denominator.

## AI-score outcome

`firstCompletedAiScoreWithin14Days` and `firstAiScoreRate` measure a completed Writing/Speaking score after a positive paid activation, inside fourteen days and before a recorded expiry/revocation. They are separate from `firstCompletedPracticeWithin14Days`, which also includes free Reading/Listening. This infers that the score completed while the recorded paid entitlement was active; it does not assert which quota bucket was charged or reconstruct unrecorded subscription cancellation history.

Estimator results already mirrored into `scores` count as prior AI results for `withPriorCompletedAiScore`. The SQL classifies their source with a scalar JSON comparison inside the database; it does not retrieve essay/response content. Estimator results do **not** count as paid AI-score outcomes, even if revealed after activation. No anonymous estimator identity is stitched to later behavior and no extra estimator content query is needed.


## September 18 offer and reconciliation revision

The sequential `feedback_value_v2` offer follows `exam_pass_v1`. `consentLimitedEvents`
now groups by `offer_version`; `observedSignedInOfferPath` contains one entry per
14/28-day window **and version**, with `offerVersion` explicitly set. View and
click must share that version. A learner exposed to both versions can appear in
both denominators: do not sum them or interpret this rollout as a randomized
experiment. The operational eligibility/revenue windows remain unchanged.
The September 10 change to default-on optional tracking (still respecting stored
refusal and GPC) also changes browser coverage; missing events are not zero usage.

Charge reconciliation now lists modern Stripe InvoicePayment records for exact
Checkout invoice → PaymentIntent → charge links, alongside direct one-time
PaymentIntent and legacy charge invoice links. No customer/amount/time heuristic
is used. Only successful live charges enter `matchedCheckoutCharges`; linked
failed attempts are separately `matchedFailedCheckoutCharges`. Recurring renewal
invoices do not match an initial Checkout invoice and remain excluded.
Provider pagination/errors fail the report instead of silently treating absent
links as zero. All calls remain read-only lists and all exported figures remain
aggregate. Refund/dispute state is current at report generation, not a historical
snapshot reconstructed as of the selected end date; charges created before the
window still need dedicated ledger reconciliation. These counts are diagnostic
coverage, not a net-revenue accounting report.


Optional `--anonymous-exclusions=/private/path/qa-anonymous-ids.json` accepts a
JSON array of browser anonymous UUIDs. It excludes those browser identities from
both offer-event counts and ordered offer paths, even after events acquire a
signed-in user ID. It does not change authenticated practice, Stripe or billing
operational denominators; maintain the separate user exclusions for QA accounts.
Use it for verified local/browser QA identifiers, not a guess based on traffic.
Only exclusion counts are exported. Keep this file private alongside the user
exclusions and pass the same fixed files for comparison runs. Omitting the flag
retains the existing behavior with zero explicit anonymous exclusions.


For the v2 plan-comparison CTA, use `subsequentlyCreatedAnyPlanSession` and
`subsequentlyActivatedPositiveAnyPlan` as the primary observed downstream fields.
They include monthly, annual and Exam Pass Checkout sessions after a same-version
click, with an exact positive paid activation receipt for the latter. The original
Exam-Pass-only fields remain available. Counts are unique learners per path, not
session counts. The historical event name and `sku=exam_pass` label identify the
offer surface, not exclusive purchase intent. A later Monthly purchase must not
be classified as a failed comparison-offer conversion. These ordered associations
remain observational and may overlap between versions; they are not causal lift.


## September 23: pass-first markets, 45-day pass, checkout recovery

New and extended events (all scalar props; no URLs or contact details):

| Event | Sink | Meaning |
|---|---|---|
| `view_item_list`, `select_item`, `begin_checkout`, `checkout_start` | browser (GA4 + `activity_events`) | now carry `pass_first` (true in PPP countries plus CN/HK, where the pass is the single primary card) |
| `exam_pass_offer_view` / `_click` | browser | carry `pass_first` |
| `checkout_expired` | webhook → `activity_events` (`billing_event_id = expired:<session>`), GA4 MP when `ga_cid` + secret exist | a Checkout Session hit its 3h `expires_at`; `recovery_available` says whether Stripe minted a recovery link |
| `checkout_recovered` | webhook → `activity_events` (`recovered:<session>`), GA4 MP | a session opened from that link completed; `recovered_from` = the expired session |
| `purchase_success` (server) / `purchase` (browser + GA4 MP) | both | carry `recovered_from` when applicable |

Recovery rate = distinct `checkout_recovered.recovered_from` / `checkout_expired` with `recovery_available=true`, same window. Compare `pass_first=true` vs `false` begin_checkout → purchase before/after; this is a sequential rollout, not an A/B test.

### Founder steps (in order)

1. **Stripe webhook:** add `checkout.session.expired` to the live endpoint's events (Developers → Webhooks → www endpoint). Without it, expiries fall back to the T+4h cron email with a /pricing link.
2. **Exam Pass 45 days:** `node scripts/apply-exam-pass-length.mjs` (applies `20260923120000_exam_pass_length.sql`, verifies, runs a rolled-back QA transaction). Only after it prints `applied + verified`: set `NEXT_PUBLIC_EXAM_PASS_DAYS=45` in Vercel Production and redeploy. If the env flag is set first, checkout refuses pass sales (503, log `EXAM PASS LENGTH NOT DEPLOYED`) rather than promise 45 and grant 30.
3. **Stripe product text:** after step 2 is live, rename the Exam Pass product/price nicknames from "30 days" to "45 days" (display only; prices and IDs unchanged).
4. Confirm the CASL/consent wording of the `checkout_abandoned` email ("Your IELTS Bank checkout is saved — finish in one tap").
