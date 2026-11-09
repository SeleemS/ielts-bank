// Single Writing report unlock: webhook fulfilment, refund handling and the
// checkout route. Lives outside pages/ so Next.js never serves it as a route.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_vitest';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const REPORT = '33333333-3333-4333-8333-333333333333';

// In-memory stand-in for the two tables the feature touches.
function makeAdmin({ report = { attempt_id: REPORT, user_id: USER, unlocked_at: null }, userRow = null } = {}) {
  const state = { report: report ? { ...report } : null, events: [], rateLimited: false };
  const matches = (filters) => state.report
    && filters.every(([column, value]) => (value === null ? state.report[column] == null : state.report[column] === value));
  function reports() {
    const filters = [];
    let patch = null;
    const chain = {
      update(fields) { patch = fields; return chain; },
      select() { return chain; },
      eq(column, value) { filters.push([column, value]); return chain; },
      is(column, value) { filters.push([column, value]); return chain; },
      async maybeSingle() { return { data: matches(filters) ? { ...state.report } : null, error: null }; },
      then(resolve) {
        if (patch && matches(filters)) {
          Object.assign(state.report, patch);
          return resolve({ data: [{ attempt_id: state.report.attempt_id }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  }
  const admin = {
    state,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER, email: 'learner@example.com' } }, error: null })) },
    rpc: vi.fn(async () => ({ data: !state.rateLimited, error: null })),
    from(table) {
      if (table === 'writing_reports') return reports();
      if (table === 'activity_events') {
        return {
          async insert(row) {
            if (state.events.some((event) => event.billing_event_id === row.billing_event_id)) {
              return { error: { code: '23505' } };
            }
            state.events.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'users') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: userRow, error: null }) };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return admin;
}

const session = (overrides = {}) => ({
  id: 'cs_test_unlock',
  mode: 'payment',
  payment_status: 'paid',
  amount_total: 699,
  currency: 'usd',
  client_reference_id: USER,
  payment_intent: 'pi_1',
  metadata: { sku: 'report_unlock', user_id: USER, report_id: REPORT, ppp: '0' },
  ...overrides,
});

describe('report unlock webhook', () => {
  let handleStripeEvent;
  beforeEach(async () => {
    ({ handleStripeEvent } = await import('../lib/billing'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const completed = (obj) => ({ id: 'evt_1', type: 'checkout.session.completed', data: { object: obj } });
  const stripe = { checkout: { sessions: { retrieve: vi.fn() } } };

  it('opens the report once and records one purchase, without touching the plan', async () => {
    const admin = makeAdmin();
    const first = await handleStripeEvent(completed(session()), { admin, stripe });
    expect(first).toContain(`unlocked report ${REPORT}`);
    expect(admin.state.report.unlocked_at).toBeTruthy();
    const stamp = admin.state.report.unlocked_at;

    const retry = await handleStripeEvent(completed(session()), { admin, stripe });
    expect(retry).toContain('already_unlocked');
    expect(admin.state.report.unlocked_at).toBe(stamp);
    expect(admin.state.events).toHaveLength(1);
    expect(admin.state.events[0]).toMatchObject({
      event: 'purchase_success',
      user_id: USER,
      props: { sku: 'report_unlock', amount: 699, report_id: REPORT, transaction_id: 'cs_test_unlock' },
    });
    // No plan RPC (fulfill_checkout) was called.
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('accepts a confirmed zero total but never an unpaid session', async () => {
    const free = makeAdmin();
    await handleStripeEvent(
      completed(session({ payment_status: 'no_payment_required', amount_total: 0 })), { admin: free, stripe });
    expect(free.state.report.unlocked_at).toBeTruthy();

    const unpaid = makeAdmin();
    const outcome = await handleStripeEvent(completed(session({ payment_status: 'unpaid' })), { admin: unpaid, stripe });
    expect(outcome).toBe('ignored: report unlock not paid');
    expect(unpaid.state.report.unlocked_at).toBeNull();
    expect(unpaid.state.events).toHaveLength(0);
  });

  it('does not open a report owned by another account', async () => {
    const admin = makeAdmin({ report: { attempt_id: REPORT, user_id: OTHER_USER, unlocked_at: null } });
    const outcome = await handleStripeEvent(completed(session()), { admin, stripe });
    expect(outcome).toBe('ignored: report unlock target missing');
    expect(admin.state.report.unlocked_at).toBeNull();
    expect(admin.state.events).toHaveLength(0);
  });

  it('asks Stripe to retry when the session carries no valid report', async () => {
    const admin = makeAdmin();
    const outcome = await handleStripeEvent(
      completed(session({ metadata: { sku: 'report_unlock', user_id: USER, report_id: 'nope' } })), { admin, stripe });
    expect(outcome.startsWith('error:')).toBe(true);
  });

  it('sends no recovery email for an expired unlock checkout', async () => {
    const admin = makeAdmin();
    const outcome = await handleStripeEvent(
      { id: 'evt_2', type: 'checkout.session.expired', data: { object: session({ payment_status: 'unpaid' }) } },
      { admin, stripe });
    expect(outcome).toBe('ignored: expired report unlock checkout');
    expect(admin.state.events).toHaveLength(0);
  });

  it('closes the report again on a full refund and keeps it on a partial one', async () => {
    const refundStripe = (refunded) => ({
      charges: { retrieve: vi.fn(async () => ({ id: 'ch_1', payment_intent: 'pi_1', refunded })) },
      checkout: { sessions: { list: vi.fn(async () => ({ data: [session()], has_more: false })) } },
    });
    const refundEvent = (amountRefunded) => ({
      id: `evt_refund_${amountRefunded}`,
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', amount_refunded: amountRefunded, currency: 'usd' } },
    });

    const partial = makeAdmin({ report: { attempt_id: REPORT, user_id: USER, unlocked_at: '2026-11-09T00:00:00Z' } });
    expect(await handleStripeEvent(refundEvent(200), { admin: partial, stripe: refundStripe(false) }))
      .toContain('kept report');
    expect(partial.state.report.unlocked_at).toBeTruthy();

    const full = makeAdmin({ report: { attempt_id: REPORT, user_id: USER, unlocked_at: '2026-11-09T00:00:00Z' } });
    expect(await handleStripeEvent(refundEvent(699), { admin: full, stripe: refundStripe(true) }))
      .toContain('relocked report');
    expect(full.state.report.unlocked_at).toBeNull();
    expect(full.state.events[0]).toMatchObject({ event: 'payment_refunded', props: { sku: 'report_unlock', amount: 699 } });
    // The plan-revocation RPC is never involved.
    expect(full.rpc).not.toHaveBeenCalled();
  });
});

describe('POST /api/billing/report-unlock', () => {
  const stripeMock = { checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } } };
  let admin;
  let handler;

  function makeRes() {
    return {
      statusCode: null, jsonBody: null, headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.jsonBody = body; return this; },
    };
  }
  const makeReq = (body, headers = {}) => ({
    method: 'POST',
    headers: { origin: 'https://www.ielts-bank.com', authorization: 'Bearer token', ...headers },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  });
  const freeUser = { id: USER, email: 'learner@example.com', stripe_customer_id: null, plan: 'free', plan_status: 'inactive' };

  async function load({ enabled = '1', adminOptions = { userRow: freeUser } } = {}) {
    vi.resetModules();
    process.env.NEXT_PUBLIC_REPORT_UNLOCK = enabled;
    admin = makeAdmin(adminOptions);
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => admin }));
    vi.doMock('../lib/billing', async () => {
      const actual = await vi.importActual('../lib/billing');
      return { ...actual, getStripe: () => stripeMock };
    });
    handler = (await import('../pages/api/billing/report-unlock')).default;
  }

  beforeEach(() => {
    stripeMock.checkout.sessions.create.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/s' });
    stripeMock.checkout.sessions.retrieve.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@supabase/supabase-js');
    vi.doUnmock('../lib/billing');
    delete process.env.NEXT_PUBLIC_REPORT_UNLOCK;
  });

  it('is off unless the flag is set', async () => {
    await load({ enabled: '' });
    const res = makeRes();
    await handler(makeReq({ reportId: REPORT }), res);
    expect(res.statusCode).toBe(404);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('opens a one-time checkout at the list price, stamped with the user and report', async () => {
    await load();
    const res = makeRes();
    await handler(makeReq({ reportId: REPORT }), res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ url: 'https://checkout.stripe.test/s' });
    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'usd', unit_amount: 699 });
    expect(params.customer_email).toBe('learner@example.com');
    expect(params.client_reference_id).toBe(USER);
    expect(params.metadata).toMatchObject({ sku: 'report_unlock', user_id: USER, report_id: REPORT, ppp: '0' });
    expect(params.success_url).toBe(
      `https://www.ielts-bank.com/writing-report/${REPORT}?unlock=success&session_id={CHECKOUT_SESSION_ID}`
    );
    expect(params).not.toHaveProperty('subscription_data');
  });

  it('charges the regional price from the request geography, not the client', async () => {
    await load();
    const res = makeRes();
    await handler(makeReq({ reportId: REPORT, ppp: false, amount: 1 }, { 'x-vercel-ip-country': 'IN' }), res);
    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(299);
    expect(params.metadata.ppp).toBe('1');
  });

  it('refuses a report that is not in this account', async () => {
    await load({ adminOptions: { userRow: freeUser, report: { attempt_id: REPORT, user_id: OTHER_USER, unlocked_at: null } } });
    const res = makeRes();
    await handler(makeReq({ reportId: REPORT }), res);
    expect(res.statusCode).toBe(404);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('does not sell to a Pro member or for an already open report', async () => {
    await load({ adminOptions: { userRow: { ...freeUser, plan: 'premium', plan_status: 'active' } } });
    const pro = makeRes();
    await handler(makeReq({ reportId: REPORT }), pro);
    expect(pro.statusCode).toBe(409);
    expect(pro.jsonBody.code).toBe('already_pro');

    await load({ adminOptions: { userRow: freeUser, report: { attempt_id: REPORT, user_id: USER, unlocked_at: '2026-11-09T00:00:00Z' } } });
    const open = makeRes();
    await handler(makeReq({ reportId: REPORT }), open);
    expect(open.jsonBody).toEqual({ unlocked: true });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('confirms a paid session on return and opens the report', async () => {
    await load();
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(session());
    const res = makeRes();
    await handler(makeReq({ reportId: REPORT, sessionId: 'cs_test_unlock' }), res);
    expect(res.jsonBody).toEqual({ unlocked: true });
    expect(admin.state.report.unlocked_at).toBeTruthy();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a session paid for a different report or user, and an unpaid one', async () => {
    await load();
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(
      session({ client_reference_id: OTHER_USER, metadata: { sku: 'report_unlock', user_id: OTHER_USER, report_id: REPORT } }));
    const wrongUser = makeRes();
    await handler(makeReq({ reportId: REPORT, sessionId: 'cs_test_unlock' }), wrongUser);
    expect(wrongUser.statusCode).toBe(403);

    stripeMock.checkout.sessions.retrieve.mockResolvedValue(session({ payment_status: 'unpaid' }));
    const unpaid = makeRes();
    await handler(makeReq({ reportId: REPORT, sessionId: 'cs_test_unlock' }), unpaid);
    expect(unpaid.jsonBody).toEqual({ unlocked: false });
    expect(admin.state.report.unlocked_at).toBeNull();
  });

  it('requires sign-in and a same-site request', async () => {
    await load();
    const noAuth = makeRes();
    await handler(makeReq({ reportId: REPORT }, { authorization: '' }), noAuth);
    expect(noAuth.statusCode).toBe(401);
    const crossSite = makeRes();
    await handler(makeReq({ reportId: REPORT }, { origin: 'https://evil.example' }), crossSite);
    expect(crossSite.statusCode).toBe(403);
  });
});
