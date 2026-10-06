import {expect,it} from 'vitest';
import {reportDelivery} from './report-delivery.mjs';
const input=()=>({start:'2026-10-01',end:'2026-10-10',sessions:[{id:'paid',livemode:true,payment_status:'paid',amount_total:1499,client_reference_id:'u'}],fulfillments:[{session_id:'paid',user_id:'u',outcome:'applied',fulfilled_at:'2026-10-01T12:00Z'}],reports:[{attempt_id:'original',user_id:'u',unlocked_at:'2026-10-01T13:00Z',first_opened_at:'2026-10-01T13:00Z',created_at:'2026-10-01T10:00Z'},{attempt_id:'revision',user_id:'u',revision_of:'original',created_at:'2026-10-03'}]});
it('joins payment to delivered full feedback and a scored revision with mature denominators',()=>expect(reportDelivery(input())).toEqual({paidCheckouts:1,mature24h:1,fullReportServedWithin24h:1,mature7d:1,revisionScoredWithin7d:1}));
it('does not count immature windows, old reports, free sessions, or excluded accounts as successes',()=>{
 const x=input();x.end='2026-10-01T18:00Z';expect(reportDelivery(x).mature24h).toBe(0);
 x.end='2026-10-10';x.reports[0].first_opened_at='2026-09-30';expect(reportDelivery(x).fullReportServedWithin24h).toBe(0);expect(reportDelivery(x).revisionScoredWithin7d).toBe(0);
 x.sessions[0].amount_total=0;expect(reportDelivery(x).paidCheckouts).toBe(0);
 expect(reportDelivery({...input(),exclusions:['u']}).paidCheckouts).toBe(0);
});
it('bounds deliveries by revocation and deduplicates checkout receipts',()=>{
 const x=input();x.fulfillments[0].access_expires_at='2026-10-01T12:30Z';x.fulfillments.push(x.fulfillments[0]);
 expect(reportDelivery(x).paidCheckouts).toBe(1);expect(reportDelivery(x).fullReportServedWithin24h).toBe(0);
});
