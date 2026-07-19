// lib/premium.js
// Server-side premium entitlement check, shared by the AI-scoring routes.
// Mirrors the SQL logic in consume_ai_score / the client's isPremiumActive:
// an active/trialing/past_due premium plan, or a canceled one still inside
// its paid period.

export function isPremiumRow(row, now = Date.now()) {
  if (!row) return false;
  if (row.billing_pause_until && new Date(row.billing_pause_until).getTime() > now) return false;
  // A non-null expiry identifies a one-time Exam Pass. It is authoritative:
  // after that timestamp, the stored active status must not grant access.
  if (row.plan_expires_at) return new Date(row.plan_expires_at).getTime() > now;
  if (row.plan !== 'premium') return false;
  if (['active', 'trialing', 'past_due'].includes(row.plan_status)) return true;
  return (
    row.plan_status === 'canceled' &&
    Boolean(row.plan_renews_at) &&
    new Date(row.plan_renews_at).getTime() > now
  );
}

// Reads the user's billing columns with the service-role client. The explicit
// error state lets routes fail closed without misrepresenting an outage as a
// verified Free account.
export async function fetchPremiumStatus(admin, userId) {
  try {
    const { data, error } = await admin
      .from('users')
      .select('plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { isPremium: false, error };
    return { isPremium: isPremiumRow(data), error: null };
  } catch (error) {
    return { isPremium: false, error };
  }
}

// Compatibility wrapper for existing fail-closed call sites. New user-facing
// routes should prefer fetchPremiumStatus so they can distinguish an outage
// from a verified non-Premium account.
export async function fetchIsPremium(admin, userId) {
  const { isPremium } = await fetchPremiumStatus(admin, userId);
  return isPremium;
}
