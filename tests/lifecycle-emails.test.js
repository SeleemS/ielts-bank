import { describe, expect, it, vi } from 'vitest';
import {
  deliverDue,
  recipientAllowsMarketing,
  reclaimStaleDeliveries,
} from '../pages/api/cron/lifecycle-emails';
import { unsubscribeToken } from '../lib/lifecycleEmail';

const NOW = new Date('2026-07-19T12:00:00.000Z');

function resultQuery(result) {
  const query = {
    eq: () => query,
    in: () => query,
    is: () => query,
    lt: () => query,
    lte: () => query,
    order: () => query,
    limit: () => Promise.resolve(result),
    select: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('lifecycle email delivery safety', () => {
  it('uses the dedicated unsubscribe secret when configured', () => {
    const previous = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'dedicated-test-secret';
    const token = unsubscribeToken('learner@example.com');
    if (previous === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = previous;

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe('');
  });

  it('only treats a confirmed, currently subscribed recipient as marketing-eligible', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: () => resultQuery({ data: { email: 'learner@example.com' }, error: null }) })
      .mockReturnValueOnce({ select: () => resultQuery({ data: null, error: null }) });
    const admin = { from };

    await expect(recipientAllowsMarketing(admin, ' Learner@Example.com ')).resolves.toBe(true);
    await expect(recipientAllowsMarketing(admin, 'opted-out@example.com')).resolves.toBe(false);
  });

  it('returns every stale sending claim to failed, including terminal attempts', async () => {
    const filters = [];
    const query = {
      eq: (...args) => {
        filters.push(['eq', ...args]);
        return query;
      },
      is: (...args) => {
        filters.push(['is', ...args]);
        return query;
      },
      lt: (...args) => {
        filters.push(['lt', ...args]);
        return query;
      },
      select: () =>
        Promise.resolve({
          data: [{ id: 'email-1' }, { id: 'email-terminal' }],
          error: null,
        }),
    };
    const update = vi.fn(() => query);
    const admin = { from: vi.fn(() => ({ update })) };

    await expect(reclaimStaleDeliveries(admin, NOW)).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        last_error: 'delivery-claim-expired',
        updated_at: NOW.toISOString(),
      })
    );
    expect(filters).toEqual([
      ['eq', 'status', 'sending'],
      ['is', 'sent_at', null],
      ['lt', 'updated_at', '2026-07-19T11:45:00.000Z'],
    ]);
  });

  it('suppresses queued marketing after an unsubscribe without calling the provider', async () => {
    const row = {
      id: 'email-2',
      email_type: 'weekly_digest',
      recipient_email: 'opted-out@example.com',
      attempts: 0,
    };
    const lifecycleUpdates = [];
    let lifecycleSelects = 0;
    const admin = {
      from(table) {
        if (table === 'newsletter_subscribers') {
          return { select: () => resultQuery({ data: null, error: null }) };
        }
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            return resultQuery({ data: { id: row.id }, error: null });
          },
          select() {
            lifecycleSelects += 1;
            return resultQuery({ data: lifecycleSelects === 1 ? [row] : [], error: null });
          },
        };
      },
    };
    const send = vi.fn();

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 0,
      suppressed: 1,
      reclaimed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'suppressed', last_error: 'recipient-not-subscribed' })
    );
  });

  it('claims and records a consented marketing send exactly once', async () => {
    const row = {
      id: 'email-3',
      email_type: 'win_back',
      recipient_email: 'subscriber@example.com',
      attempts: 1,
      idempotency_key: 'win_back:user-1:2026-06-01',
    };
    const lifecycleUpdates = [];
    let lifecycleSelects = 0;
    const admin = {
      from(table) {
        if (table === 'newsletter_subscribers') {
          return {
            select: () =>
              resultQuery({ data: { email: 'subscriber@example.com' }, error: null }),
          };
        }
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            if (fields.status === 'sending') {
              return resultQuery({ data: { id: row.id }, error: null });
            }
            return resultQuery({ data: null, error: null });
          },
          select() {
            lifecycleSelects += 1;
            return resultQuery({ data: lifecycleSelects === 1 ? [row] : [], error: null });
          },
        };
      },
    };
    const send = vi.fn().mockResolvedValue({ sent: true, providerId: 'resend-1' });

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 1,
      suppressed: 0,
      reclaimed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 2 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sent', provider_id: 'resend-1' })
    );
  });

  it('records a rejected delivery immediately and continues the remaining batch', async () => {
    const rows = [
      {
        id: 'email-4',
        email_type: 'welcome_signup',
        recipient_email: 'first@example.com',
        attempts: 4,
        idempotency_key: 'welcome_signup:user-4',
      },
      {
        id: 'email-5',
        email_type: 'welcome_signup',
        recipient_email: 'second@example.com',
        attempts: 0,
        idempotency_key: 'welcome_signup:user-5',
      },
    ];
    const lifecycleUpdates = [];
    let dueReads = 0;
    const admin = {
      from(table) {
        expect(table).toBe('lifecycle_emails');
        return {
          update(fields) {
            lifecycleUpdates.push(fields);
            if (fields.last_error === 'delivery-claim-expired') {
              return resultQuery({ data: [], error: null });
            }
            if (fields.status === 'sending') {
              return resultQuery({ data: { id: 'claimed' }, error: null });
            }
            return resultQuery({ data: null, error: null });
          },
          select() {
            dueReads += 1;
            return resultQuery({
              data: dueReads === 1 ? rows : [],
              error: null,
            });
          },
        };
      },
    };
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('provider\nnetwork\u0000 unavailable')
      )
      .mockResolvedValueOnce({ sent: true, providerId: 'resend-2' });

    await expect(deliverDue(admin, { send, now: NOW })).resolves.toMatchObject({
      sent: 1,
      failed: 1,
      skipped: 0,
      reclaimed: 0,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 5 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        last_error: 'delivery-error: provider network unavailable',
      })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sending', attempts: 1 })
    );
    expect(lifecycleUpdates).toContainEqual(
      expect.objectContaining({ status: 'sent', provider_id: 'resend-2' })
    );
  });
});
