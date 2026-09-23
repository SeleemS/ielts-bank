// checkout_abandoned cron fallback + delivery guard. The primary path is the
// checkout.session.expired webhook (lib/checkoutRecovery.js); the cron only
// covers expiries that never reached it, and never doubles up.
import { describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_ABANDONED_DELAY_HOURS,
  deliverDue,
  queueCheckoutAbandoned,
} from '../pages/api/cron/lifecycle-emails';

const NOW = new Date('2026-09-23T12:00:00.000Z');

function chain(result, calls = []) {
  const query = {};
  for (const method of ['select', 'eq', 'gt', 'gte', 'in', 'is', 'lt', 'lte', 'not', 'order']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.limit = () => Promise.resolve(result);
  query.maybeSingle = () => Promise.resolve(result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('queueCheckoutAbandoned', () => {
  function fakeAdmin({ events, users, recent }) {
    const calls = { activity: [], upserts: [] };
    return {
      calls,
      from(table) {
        if (table === 'activity_events') return chain({ data: events, error: null }, calls.activity);
        if (table === 'users') return chain({ data: users, error: null });
        if (table === 'lifecycle_emails') {
          const query = chain({ data: recent, error: null });
          query.upsert = (rows, options) => {
            calls.upserts.push({ rows, options });
            return { select: async () => ({ data: rows.map((_, i) => ({ id: i })), error: null }) };
          };
          return query;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  it('waits until after the 3-hour expiry and skips learners emailed in the last 7 days', async () => {
    const admin = fakeAdmin({
      events: [
        { user_id: 'fresh', props: { source: 'writing', sku: 'exam_pass' }, created_at: '2026-09-23T06:00:00Z' },
        { user_id: 'nudged', props: { source: 'pricing', sku: 'monthly' }, created_at: '2026-09-23T05:00:00Z' },
      ],
      users: [
        { id: 'fresh', email: 'Fresh@Example.com', plan: 'free' },
        { id: 'nudged', email: 'n@example.com', plan: 'free' },
      ],
      recent: [{ user_id: 'nudged' }],
    });

    await expect(queueCheckoutAbandoned(admin, NOW)).resolves.toBe(1);
    expect(CHECKOUT_ABANDONED_DELAY_HOURS).toBeGreaterThan(3);
    expect(admin.calls.activity).toContainEqual(['lt', 'created_at', '2026-09-23T08:00:00.000Z']);
    expect(admin.calls.activity).toContainEqual(['gte', 'created_at', '2026-09-22T08:00:00.000Z']);
    const rows = admin.calls.upserts.flatMap((batch) => batch.rows);
    expect(rows).toEqual([expect.objectContaining({
      user_id: 'fresh',
      recipient_email: 'fresh@example.com',
      email_type: 'checkout_abandoned',
      idempotency_key: 'checkout_abandoned:fresh:2026-09-23',
      payload: { upgrade: 'writing', sku: 'exam_pass' },
    })]);
  });
});

describe('deliverDue checkout_abandoned guard', () => {
  function deliveryAdmin({ row, userRow }) {
    const updates = [];
    let lifecycleSelects = 0;
    return {
      updates,
      from(table) {
        if (table === 'users') {
          return chain({ data: userRow, error: null });
        }
        return {
          update(fields) {
            updates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') return chain({ data: [], error: null });
            return chain({ data: { id: row.id }, error: null });
          },
          select() {
            lifecycleSelects += 1;
            return chain({ data: lifecycleSelects === 1 ? [row] : [], error: null });
          },
        };
      },
    };
  }

  const row = {
    id: 'email-recovery',
    user_id: 'user-1',
    email_type: 'checkout_abandoned',
    recipient_email: 'learner@example.com',
    attempts: 0,
    idempotency_key: 'checkout_abandoned:user-1:2026-09-23',
    payload: { recovery_url: 'https://buy.stripe.com/r/live_x' },
  };

  it('suppresses the follow-up once the learner has bought Pro another way', async () => {
    const admin = deliveryAdmin({ row, userRow: { plan: 'premium', plan_status: 'active', prefs: { study_plan_emails: true } } });
    const send = vi.fn();
    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({ sent: 0, suppressed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(admin.updates).toContainEqual(expect.objectContaining({ status: 'suppressed', last_error: 'already-purchased' }));
  });

  it('still applies the study-plan preference gate to free learners', async () => {
    const optedOut = deliveryAdmin({ row, userRow: { plan: 'free', prefs: { study_plan_emails: false }, created_at: '2026-08-01T00:00:00Z' } });
    const send = vi.fn();
    await expect(deliverDue(optedOut, { send, now: NOW })).resolves.toMatchObject({ sent: 0, suppressed: 1 });
    expect(optedOut.updates).toContainEqual(expect.objectContaining({ last_error: 'pref-opted-out' }));

    const optedIn = deliveryAdmin({ row, userRow: { plan: 'free', prefs: { study_plan_emails: true }, created_at: '2026-08-01T00:00:00Z' } });
    const sendOk = vi.fn().mockResolvedValue({ sent: true, providerId: 'resend-9' });
    await expect(deliverDue(optedIn, { send: sendOk, now: NOW })).resolves.toMatchObject({ sent: 1 });
    expect(sendOk).toHaveBeenCalledWith(row);
  });
});
