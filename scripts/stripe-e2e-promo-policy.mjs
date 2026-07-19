export function isPromotionRedeemable(
  promotion,
  { couponValid = true, now = Math.floor(Date.now() / 1000) } = {},
) {
  if (!couponValid) return false;
  if (promotion.expires_at != null && promotion.expires_at <= now) return false;
  if (
    promotion.max_redemptions != null
    && promotion.times_redeemed >= promotion.max_redemptions
  ) {
    return false;
  }
  return true;
}

export function planE2EPromotionChange(
  promotions,
  { mode, couponValid = true, now } = {},
) {
  if (mode === 'deactivate') {
    const targets = promotions.filter((promotion) => promotion.active);
    return targets.length
      ? { type: 'deactivate', promotions: targets }
      : { type: 'none', promotions: [] };
  }

  if (mode !== 'activate') {
    throw new Error(`Unsupported E2E promotion mode: ${mode}`);
  }

  const redeemable = promotions.filter((promotion) =>
    isPromotionRedeemable(promotion, { couponValid, now }));
  const active = redeemable.find((promotion) => promotion.active);
  if (active) return { type: 'none', promotion: active };

  const inactive = redeemable[0];
  if (inactive) return { type: 'activate', promotion: inactive };

  return { type: 'create' };
}
