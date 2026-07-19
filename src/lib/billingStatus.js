export function billingStatusMessage({
  pauseUntil,
  expiresAt,
  planStatus,
  renewsAt,
  isPremium,
  now = Date.now(),
}) {
  if (pauseUntil && new Date(pauseUntil).getTime() > now) {
    return `Your current pause ends ${new Date(pauseUntil).toLocaleDateString()}.`;
  }
  if (expiresAt) {
    return `Your Exam Pass ends ${new Date(expiresAt).toLocaleDateString()}.`;
  }
  if (planStatus === 'canceled' && renewsAt) {
    return `Your Premium access continues until ${new Date(renewsAt).toLocaleDateString()}. It will not renew.`;
  }
  if (renewsAt) {
    return `Your next renewal is ${new Date(renewsAt).toLocaleDateString()}.`;
  }
  return isPremium
    ? 'Your Premium tools are active.'
    : 'Your subscription is not currently active.';
}

export function canOfferBillingPause({
  isPremium,
  planStatus,
  renewsAt,
  expiresAt,
  pauseUsedAt,
}) {
  return Boolean(
    isPremium
    && planStatus !== 'canceled'
    && renewsAt
    && !expiresAt
    && !pauseUsedAt
  );
}
