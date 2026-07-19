// lib/premium.js
// Server-side premium entitlement check, shared by the AI-scoring routes.
// Mirrors the SQL logic in consume_ai_score / the client's isPremiumActive:
// an active/trialing/past_due premium plan, or a canceled one still inside
// its paid period.

export function isPremiumRow(row, now = Date.now()) {
  if (!row) return false;
  if (row.billing_pause_until && new Date(row.billing_pause_until).getTime() > now) return false;
  if (row.plan_expires_at && new Date(row.plan_expires_at).getTime() > now) return true;
  if (row.plan !== 'premium') return false;
  if (['active', 'trialing', 'past_due'].includes(row.plan_status)) return true;
  return (
    row.plan_status === 'canceled' &&
    Boolean(row.plan_renews_at) &&
    new Date(row.plan_renews_at).getTime() > now
  );
}

// Reads the user's billing columns with the service-role client. Fails CLOSED
// (returns false) on any error — a DB hiccup must not open free OpenAI spend.
export async function fetchIsPremium(admin, userId) {
  try {
    const { data, error } = await admin
      .from('users')
      .select('plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return false;
    return isPremiumRow(data);
  } catch {
    return false;
  }
}
