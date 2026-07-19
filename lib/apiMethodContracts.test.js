import { describe, expect, it } from 'vitest';
import cleanupHandler from '../pages/api/cron/cleanup';
import dailyReportHandler from '../pages/api/cron/daily-report';
import lifecycleEmailsHandler from '../pages/api/cron/lifecycle-emails';
import unsubscribeHandler from '../pages/api/newsletter/unsubscribe';

const handlers = [
  ['cleanup cron', cleanupHandler],
  ['daily-report cron', dailyReportHandler],
  ['lifecycle-emails cron', lifecycleEmailsHandler],
  ['newsletter unsubscribe', unsubscribeHandler],
];

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

describe.each(handlers)('%s method contract', (_name, handler) => {
  it('returns 405 with the supported method in Allow', async () => {
    const response = responseRecorder();

    await handler({ method: 'POST', headers: {} }, response);

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('GET');
    expect(response.ended).toBe(true);
  });
});
