// Delivery within a paid Checkout window. This is fulfillment QA, not a causal
// conversion metric. Counts checkouts (not distinct new buyers); no content read.
export function reportDelivery({ sessions, fulfillments, reports, start, end, exclusions = [] }) {
  const stop=Date.parse(end), begin=Date.parse(start), excluded=new Set(exclusions);
  const result={paidCheckouts:0,mature24h:0,fullReportServedWithin24h:0,mature7d:0,revisionScoredWithin7d:0};
  const seen=new Set();
  for(const f of fulfillments) {
    const at=Date.parse(f.fulfilled_at);
    if(f.outcome!=='applied'||at<begin||at>=stop||excluded.has(f.user_id)||seen.has(f.session_id))continue;
    const session=sessions.find(s=>s.id===f.session_id);
    if(!session?.livemode||session.payment_status!=='paid'||!(session.amount_total>0)||(session.client_reference_id||session.metadata?.user_id)!==f.user_id)continue;
    seen.add(f.session_id);result.paidCheckouts++;
    const accessEnd=f.access_expires_at?Date.parse(f.access_expires_at):Infinity;
    const originals=reports.filter(r=>r.user_id===f.user_id&&Date.parse(r.unlocked_at)>=at&&Date.parse(r.first_opened_at)>=at&&Date.parse(r.first_opened_at)<Math.min(at+86400000,stop,accessEnd));
    if(at+86400000<=stop){result.mature24h++;if(originals.length)result.fullReportServedWithin24h++;}
    if(at+7*86400000<=stop){
      result.mature7d++;
      if(reports.some(r=>r.user_id===f.user_id&&Date.parse(r.created_at)>=at&&Date.parse(r.created_at)<Math.min(at+7*86400000,stop,accessEnd)&&originals.some(o=>o.attempt_id===r.revision_of)))result.revisionScoredWithin7d++;
    }
  }
  return result;
}
