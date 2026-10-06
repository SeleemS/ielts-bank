import { beforeEach, expect, it, vi } from 'vitest';
const id = '10000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({ user: null, row: null, plan: null, calls: [], readError: null, updateError: null, authError: null }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => { if (state.authError) throw state.authError; return { data: { user: state.user } }; } },
  from(table) {
    const filters = []; let update;
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; },
      update(values) { update = values; return query; },
      maybeSingle() { return query; },
      then(resolve, reject) {
        state.calls.push({ table, filters, update });
        if (table === 'users') return Promise.resolve({ data: state.plan, error: state.readError }).then(resolve, reject);
        const owned = state.row && filters.every(([key, value]) => state.row[key] === value);
        if (update && owned && !state.updateError) Object.assign(state.row, update);
        return Promise.resolve({ data: owned ? { ...state.row } : null, error: update ? state.updateError : state.readError }).then(resolve, reject);
      },
    }; return query;
  },
}) }));
import handler from '../pages/api/writing-reports/[id]';
const full = { overallBand: 6, criteria: { taskResponse: { band: 6, strengths: ['Clear'], improvements: ['Develop'] } }, summary: 'Private summary', improvements: ['Private plan'], correctedExamples: [{ original: 'One', suggestion: 'First' }, { original: 'Two', suggestion: 'Second' }], rewrite: { text: 'Private rewrite' } };
function res() { return { code: null, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } }; }
async function call(method='GET', overrides={}) { const r=res(); await handler({ method, headers: { authorization: 'Bearer token', origin: 'https://www.ielts-bank.com' }, query: { id }, ...overrides }, r); return r; }
beforeEach(() => {
  state.user={ id: 'owner', email: 'test@example.test' }; state.plan={ plan:'free' }; state.calls=[];
  state.row={ attempt_id:id,user_id:'owner',task:2,task_type:'task2',prompt:'Question',result:full,unlocked_at:null,first_opened_at:null,revision_of:null,created_at:'2026-10-06T00:00:00Z', attempts:{responses:{essay:'Own essay'}} };
  state.readError=null;state.updateError=null;state.authError=null;
  vi.spyOn(console,'error').mockImplementation(() => {});
});
it('returns a useful free diagnostic without sending any locked text', async () => {
  const r=await call(); expect(r.code).toBe(200); expect(r.body.result.free).toBe(true);
  expect(r.body.result.correctedExamples).toHaveLength(1); expect(r.body.result.criteria).toEqual(full.criteria);
  expect(JSON.stringify(r.body)).not.toMatch(/Private summary|Private plan|Private rewrite|Second/);
  expect(r.headers['Cache-Control']).toBe('private, no-store'); expect(state.calls.every(c=>!c.update)).toBe(true);
});
it('never discloses another account report or changes its unlock state', async () => {
  state.user.id='attacker'; const r=await call('POST'); expect(r.code).toBe(404); expect(state.row.unlocked_at).toBeNull(); expect(state.calls).toHaveLength(1);
});
it.each([null, {id:'owner',is_anonymous:true}, {id:'owner',email:null}])('rejects unlinked authentication %j', async user => {
  state.user=user; expect((await call()).code).toBe(401); expect(state.calls).toHaveLength(0);
});
it('refuses expired or paused entitlement regardless of active plan status', async () => {
  state.plan={plan:'premium',plan_status:'active',plan_expires_at:'2020-01-01'};
  expect((await call('POST')).code).toBe(402);
  state.plan={plan:'premium',plan_status:'active',billing_pause_until:'2099-01-01'};
  expect((await call('POST')).code).toBe(402); expect(state.row.unlocked_at).toBeNull();
});
it('only POST unlocks, delivers the identical saved feedback, and retries preserve first timestamps', async () => {
  state.plan={plan:'premium',plan_status:'active'};
  const preview=await call(); expect(preview.body.canUnlock).toBe(true); expect(preview.body.result.free).toBe(true);
  expect(state.row.unlocked_at).toBeNull(); const opened=await call('POST');
  expect(opened.body.result.summary).toBe(full.summary); expect(opened.body.result.free).toBe(false);
  const timestamps=[state.row.unlocked_at,state.row.first_opened_at]; expect(timestamps.every(Boolean)).toBe(true);
  await call('POST'); expect([state.row.unlocked_at,state.row.first_opened_at]).toEqual(timestamps);
  expect(state.calls.every(c=>['writing_reports','users'].includes(c.table))).toBe(true);
});
it('keeps already delivered feedback in the owner history after expiry or refund', async () => {
  state.row.unlocked_at='2026-10-01'; state.plan={plan:'free'};
  const r=await call('POST'); expect(r.body.result.summary).toBe(full.summary);
  expect(state.calls.every(c=>c.table==='writing_reports')).toBe(true);
});
it('fails closed when entitlement or persistence is unavailable', async () => {
  state.readError={message:'offline'}; expect((await call('POST')).code).toBe(503);
  state.readError=null;state.plan={plan:'premium',plan_status:'active'};state.updateError={message:'offline'};
  const r=await call('POST');expect(r.code).toBe(503);expect(r.body.result).toBeUndefined();expect(state.row.unlocked_at).toBeNull();
});
it('rejects foreign origins, malformed IDs and unsigned calls before data access', async () => {
  expect((await call('POST',{headers:{authorization:'Bearer token',origin:'https://evil.example'}})).code).toBe(403);
  expect((await call('GET',{query:{id:'bad'}})).code).toBe(400);
  expect((await call('GET',{headers:{}})).code).toBe(401);expect(state.calls).toHaveLength(0);
});
