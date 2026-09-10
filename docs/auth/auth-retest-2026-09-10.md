# Authentication retest — 10 September 2026

Status snapshot: **frontend commit `1153610` is live. Vercel deployment `dpl_5angph7US4gDSUuy55mqoqy9AT3W` is Ready and aliases www.ielts-bank.com; live callback error guidance and its sign-in modal were verified. The mailbox signup guard is live; friendly pre-create hook verification is pending.** This report records production Auth API operations beginning at 19:36:35 UTC and a separate local frontend regression run. These results do not establish that every device, account flow, or email provider works.

## Production API results

Tests used authorized test accounts. Addresses, passwords, codes, and session tokens are omitted.

| Journey | Observed result |
| --- | --- |
| New account | Signup accepted (200), unconfirmed with one identity and no session; correct signup OTP subsequently confirmed the account and created a session (200). |
| Sign in before confirmation | Rejected with `email_not_confirmed` (400). |
| Confirmed account login | Succeeded with a session (200). |
| Wrong password / unknown account | Rejected with `invalid_credentials` (400). |
| Exact duplicate signup | Obfuscated existing-account response: 200, zero identities, no session. This is not evidence of a new account. |
| Immediate resend | Correctly rate limited (429), with 58 seconds remaining. After cooldown, resend succeeded (200); the previous code was then rejected (403). The replacement code confirmed the account (200), followed by successful password login. |
| Code rejection and reuse | Invalid/expired code rejected (403); valid code then succeeded (200); subsequent reuse rejected (403). The log does not distinguish the first rejection's invalid-versus-expired cause. |
| Password recovery | Request accepted (200), recovery OTP verified with a session (200), password update accepted (200). Old password then failed (400), and new password login succeeded (200). |
| Mixed-case email login | Succeeded with a session (200). |
| Malformed email / weak password | Rejected with `validation_failed` (400) / `weak_password` (422). |
| Session refresh / local logout | Valid refresh succeeded (200); local logout succeeded (204); refreshing the logged-out session failed with `refresh_token_not_found` (400). |

Successful OTP verification is stronger evidence than a send endpoint accepting a request. The API log alone does not measure inbox delivery time, spam placement, provider acceptance-to-delivery failures, or every user's receipt.

## Frontend fixes and local verification

Commit `1153610` includes:

- A 60-second resend cooldown, single-request locking, and protection against simultaneous verification/resend or duplicate submissions.
- Code normalization for spaced/hyphenated and Arabic/Persian digits; excess digits are rejected without truncating them.
- Verification/recovery state retained when the dialog is closed and reopened, with explicit change-email/back and restart-recovery actions.
- Clearer invalid/expired-code, connection, and rate-limit feedback.
- Removal of automatic verification completion when an unrelated account signs in in another tab. Password recovery binds updates to the verified email, user, and recovery token and rejects an account switch.
- Persistent invalid/expired-link guidance with an actionable sign-in form; an existing session cannot override an explicit callback error.
- Password-reset completion redirects according to the caller's normal post-auth destination.

**Local regression result: 1,580 tests passed across 151 files; the additional recovery restart regression then passed in the 24-test dialog suite. Lint passed. Focused regression coverage includes** (`auth.test.jsx`, `SignInDialog.test.jsx`, `auth-callback-page.test.jsx`, `authPaths.test.js`, `analytics-onboarding-journey.test.jsx`). These use mocked Auth services and establish application behavior; live API tests above establish separate backend behavior. Live callback failure and reopening sign-in passed; full interactive browser journeys remain separate from API verification.

## Remaining checks and unresolved items

- **Email design resolved at provider:** the user confirmed the designed recovery email. A fresh signup at 19:44:36 UTC used the new subject and card in Resend (email `162ebbd3-7ff4-4ed3-97e9-9449bea99be7`). Earlier signup emails fell within Supabase’s ten-minute per-template cache window following the 19:28:57 UTC update. The user supplied that code and confirmed the signup design. No additional template change was needed.
- **Mailbox guard:** migration applied and recorded after the final signup/resend tests. A new plus alias was rejected and a read-only database check confirmed no account was created. Existing QA login still succeeded. All three QA accounts are confirmed and have profile/quota rows. Actual isolated PostgreSQL tests separately covered concurrency, rollback, email changes, and historical duplicates. The friendly pre-create hook is pending.
- Verify the deployed frontend commit and retest browser signup, verification, resend, recovery, and login end to end, including the expired-link recovery UI.
- Verify real-browser cross-tab identity changes, close/reopen recovery, browser restart persistence, mobile code entry, and browser network interruption.
- Assess natural token expiry, additional mailbox providers, spam placement, and delivery timing separately; these are not covered by the current log.

Evidence source: sanitized operation fields from the local test runner's `results.jsonl`, plus the local regression run. No secrets file was inspected or included. This is an interim report for the parent task to update after deployment and remaining live checks.
