// Sequential rollout labels, not randomized experiment assignments.
export const FUNNEL_VERSION = 'paid_journey_v2';
export const OFFER_VERSION = 'feedback_value_v2';
export const SIGNUP_VERSION = 'signup_email_first_v1';
export const ENTRY_VERSION = 'practice_entry_v1';
const INTENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function checkoutIntent(value) {
  return typeof value === 'string' && INTENT_RE.test(value) ? value : null;
}
export function checkoutAttribution(body) {
  const intent = checkoutIntent(body?.funnel_intent_id);
  return intent && body?.funnel_version === FUNNEL_VERSION
    ? { funnel_intent_id: intent, funnel_version: FUNNEL_VERSION } : {};
}
