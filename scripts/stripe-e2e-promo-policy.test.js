import { describe, expect, it } from 'vitest';
import {
  isPromotionRedeemable,
  planE2EPromotionChange,
} from './stripe-e2e-promo-policy.mjs';

const promotion = (overrides = {}) => ({
  id: 'promo_test',
  active: false,
  expires_at: null,
  max_redemptions: 5,
  times_redeemed: 1,
  ...overrides,
});

describe('Stripe E2E promotion policy', () => {
  it('reactivates an inactive promotion that can still be redeemed', () => {
    expect(planE2EPromotionChange([promotion()], {
      mode: 'activate',
      couponValid: true,
    })).toEqual({
      type: 'activate',
      promotion: promotion(),
    });
  });

  it('does not mutate an active, redeemable promotion', () => {
    const active = promotion({ active: true });

    expect(planE2EPromotionChange([active], {
      mode: 'activate',
      couponValid: true,
    })).toEqual({ type: 'none', promotion: active });
  });

  it('creates a replacement when existing promotions are exhausted or expired', () => {
    const exhausted = promotion({ times_redeemed: 5 });
    const expired = promotion({ expires_at: 1_700_000_000 });

    expect(planE2EPromotionChange([exhausted, expired], {
      mode: 'activate',
      couponValid: true,
      now: 1_800_000_000,
    })).toEqual({ type: 'create' });
  });

  it('never treats a promotion with an invalid coupon as redeemable', () => {
    expect(isPromotionRedeemable(promotion(), { couponValid: false })).toBe(false);
    expect(planE2EPromotionChange([promotion()], {
      mode: 'activate',
      couponValid: false,
    })).toEqual({ type: 'create' });
  });

  it('deactivates every active matching promotion and otherwise does nothing', () => {
    const activeOne = promotion({ id: 'promo_one', active: true });
    const activeTwo = promotion({ id: 'promo_two', active: true });
    const inactive = promotion({ id: 'promo_three' });

    expect(planE2EPromotionChange([activeOne, inactive, activeTwo], {
      mode: 'deactivate',
    })).toEqual({
      type: 'deactivate',
      promotions: [activeOne, activeTwo],
    });
    expect(planE2EPromotionChange([inactive], {
      mode: 'deactivate',
    })).toEqual({ type: 'none', promotions: [] });
  });
});
