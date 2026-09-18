import { describe, it, expect, vi } from 'vitest';
import { recordCheckoutOperation } from './checkoutOperations';
describe('checkout operational records', () => {
  it('stores bounded billing facts without arbitrary request/provider content', async () => {
    const insert = vi.fn().mockResolvedValue({});
    const admin = { from: () => ({ insert }) };
    await recordCheckoutOperation(admin, { userId: 'u', sku: 'exam_pass', requestId: 'r', sessionId: 'cs_1', stage: 'session', created: true, email: 'private', error: 'private' });
    expect(insert.mock.calls[0][0]).toEqual({ anon_id: 'billing:u', user_id: 'u', billing_event_id: 'checkout_created:cs_1', event: 'checkout_session_created', props: { source: 'billing_checkout', operational: true, sku: 'exam_pass', stage: 'session', transaction_id: 'cs_1' } });
  });
  it('does not break checkout when the operational write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await recordCheckoutOperation({ from: () => { throw new Error('database'); } }, { userId: 'u', sku: 'monthly', requestId: 'r', stage: 'catalog' })).toBe(false);
    vi.restoreAllMocks();
  });
  it('rejects unbounded stage values before writing', async () => {
    const from = vi.fn();
    expect(await recordCheckoutOperation({ from }, { userId: 'u', sku: 'monthly', stage: 'private provider message' })).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
it('joins a consent-supplied versioned intent without accepting extra request data', async () => {
  const insert = vi.fn().mockResolvedValue({});
  const attribution = { funnel_intent_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', funnel_version: 'paid_journey_v2', email: 'private' };
  await recordCheckoutOperation({ from: () => ({ insert }) }, { userId: 'u', sku: 'monthly', requestId: 'r', stage: 'session', attribution });
  expect(insert.mock.calls[0][0].props).toMatchObject({ funnel_intent_id: attribution.funnel_intent_id, funnel_version: 'paid_journey_v2' });
  expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain('private');
});
