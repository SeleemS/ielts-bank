import { describe,it,expect } from 'vitest';
import { summarizeFunnel, observedOfferPath, reconcileCheckoutCharges } from './funnel-report-core.mjs';
const date = d => `2026-09-${String(d).padStart(2,'0')}T12:00:00Z`;
const session = (id,user,day,amount=1499) => ({id,client_reference_id:user,created:Date.parse(date(day))/1000,livemode:true,status:'complete',payment_status:'paid',amount_total:amount,currency:'usd',mode:'payment'});
const receipt = (id,day,extra={}) => ({session_id:id,fulfilled_at:date(day),outcome:'applied',...extra});
describe('paid funnel cohort aggregation',()=>{
  it('excludes QA, zero orders and repeat purchases from first-checkout revenue',()=>{
    const result=summarizeFunnel({users:[{id:'a'},{id:'qa'},{id:'zero'},{id:'free'}],
      practice:['a','qa','zero','free'].map(user_id=>({user_id,completed_at:date(1)})).concat({user_id:'a',completed_at:date(3)}),
      sessions:[session('one','a',2),session('two','a',4),session('qa','qa',2),session('zero','zero',2,0)],
      fulfillments:[receipt('one',2),receipt('two',4),receipt('qa',2),receipt('zero',2)],exclusions:['qa'],end:'2026-09-20T00:00:00Z',days:28});
    expect(result.eligiblePractisingLearners).toBe(3);
    expect(result.revenueByCurrency.usd).toEqual({grossCollectedMinor:1499,perEligibleLearnerMinor:1499/3});
    expect(result.returningPurchaseActivations).toBe(1);
    expect(result.zeroValueActivationsExcluded).toBe(1);
    expect(result.firstCompletedPracticeWithin14Days).toBe(1);
  });
  it('does not treat checkout creation as activation or partial follow-up as failure',()=>{
    const result=summarizeFunnel({users:[{id:'a'},{id:'b'}],practice:[{user_id:'a',completed_at:date(1)},{user_id:'b',completed_at:date(1)}],
      sessions:[session('missing','a',2),session('recent','b',14)],fulfillments:[receipt('recent',14)],end:'2026-09-20T00:00:00Z',days:28});
    expect(result.paidSessionsMissingActivation).toBe(1);
    expect(result.paidActivations).toBe(1);
    expect(result.matureActivatedLearners).toBe(0);
  });
  it('does not count practice after revoked access and keeps currencies separate',()=>{
    const result=summarizeFunnel({users:[{id:'a'}],practice:[{user_id:'a',completed_at:date(1)},{user_id:'a',completed_at:date(4)}],
      sessions:[{...session('s','a',2),currency:'eur'}],fulfillments:[receipt('s',2,{access_expires_at:date(3)})],end:'2026-09-20T00:00:00Z',days:28});
    expect(result.firstCompletedPracticeWithin14Days).toBe(0);
    expect(result.revenueByCurrency.eur.grossCollectedMinor).toBe(1499);
  });
});

it('observed offer path requires ordered signed-in events and an exact paid activation',()=>{
 const sessions=[{...session('s','a',4),metadata:{sku:'exam_pass'}}];
 const result=observedOfferPath({events:[{user_id:'a',event:'exam_pass_offer_view',created_at:date(2)},{user_id:'a',event:'exam_pass_offer_click',created_at:date(3)},{user_id:'b',event:'exam_pass_offer_click',created_at:date(2)}],practice:[{user_id:'a',completed_at:date(1),kind:'ai_score'}],sessions,fulfillments:[receipt('s',4)],end:'2026-09-20T00:00:00Z',days:28});
 expect(result).toMatchObject({signedInObservedOfferLearners:1,withPriorCompletedAiScore:1,subsequentlyClicked:1,subsequentlyCreatedExamPassSession:1,subsequentlyActivatedPositiveExamPass:1});
});

it('prior paid invoice excludes an existing customer from new learner revenue',()=>{
 const result=summarizeFunnel({users:[{id:'a'}],practice:[{user_id:'a',completed_at:date(1)}],sessions:[session('s','a',2)],fulfillments:[receipt('s',2)],priorPayments:[{user_id:'a',paid_at:'2026-08-01T00:00:00Z'}],end:'2026-09-20T00:00:00Z',days:28});
 expect(result.eligiblePractisingLearners).toBe(0);expect(result.newPayingLearners).toBe(0);expect(result.returningPurchaseActivations).toBe(1);expect(result.revenueByCurrency.usd.grossCollectedMinor).toBe(0);
});

 it('keeps free practice and estimator results separate from post-activation AI scoring',()=>{
 const base={users:[{id:'a'}],practice:[{user_id:'a',completed_at:date(1),kind:'ai_score'},{user_id:'a',completed_at:date(3),kind:'reading'},{user_id:'a',completed_at:date(3),kind:'estimator_ai_score'}],sessions:[session('s','a',2)],fulfillments:[receipt('s',2)],end:'2026-09-20T00:00:00Z',days:28};
 const freeOnly=summarizeFunnel(base);
 expect(freeOnly.firstCompletedPracticeWithin14Days).toBe(1);expect(freeOnly.firstCompletedAiScoreWithin14Days).toBe(0);
 const paid=summarizeFunnel({...base,practice:[...base.practice,{user_id:'a',completed_at:date(4),kind:'ai_score'}]});
 expect(paid.firstCompletedAiScoreWithin14Days).toBe(1);expect(paid.firstAiScoreRate).toBe(1);
 const revoked=summarizeFunnel({...base,practice:[...base.practice,{user_id:'a',completed_at:date(4),kind:'ai_score'}],fulfillments:[receipt('s',2,{access_expires_at:date(3)})]});
 expect(revoked.firstCompletedAiScoreWithin14Days).toBe(0);
 });
 it('offer eligibility accepts a mirrored estimator AI result but rejects Reading-only history',()=>{
 const base={events:[{user_id:'a',event:'exam_pass_offer_view',created_at:date(2)}],sessions:[],fulfillments:[],end:'2026-09-20T00:00:00Z',days:28};
 expect(observedOfferPath({...base,practice:[{user_id:'a',completed_at:date(1),kind:'reading'}]}).withPriorCompletedAiScore).toBe(0);
 expect(observedOfferPath({...base,practice:[{user_id:'a',completed_at:date(1),kind:'estimator_ai_score'}]}).withPriorCompletedAiScore).toBe(1);
 });

it('separates offer versions without attributing another version click to the original view', () => {
 const base = { events: [
  { user_id:'a',event:'exam_pass_offer_view',created_at:date(2),offer_version:'exam_pass_v1' },
  { user_id:'a',event:'exam_pass_offer_click',created_at:date(3),offer_version:'feedback_value_v2' },
 ], practice:[{user_id:'a',completed_at:date(1),kind:'ai_score'}],sessions:[],fulfillments:[],end:'2026-09-20T00:00:00Z',days:28 };
 expect(observedOfferPath({...base,offerVersion:'exam_pass_v1'})).toMatchObject({offerVersion:'exam_pass_v1',signedInObservedOfferLearners:1,subsequentlyClicked:0});
 expect(observedOfferPath({...base,offerVersion:'feedback_value_v2'})).toMatchObject({offerVersion:'feedback_value_v2',signedInObservedOfferLearners:0,subsequentlyClicked:0});
 const versionTwo={...base,events:[...base.events,{user_id:'a',event:'exam_pass_offer_view',created_at:date(2),offer_version:'feedback_value_v2'}]};
 expect(observedOfferPath({...versionTwo,offerVersion:'feedback_value_v2'})).toMatchObject({signedInObservedOfferLearners:1,subsequentlyClicked:1});
});

it('links modern invoice payments exactly and excludes unrelated renewals, test mode and failed charges from settled counts', () => {
 const good={livemode:true,paid:true,status:'succeeded',amount_refunded:0,disputed:false};
 const result=reconcileCheckoutCharges({
  sessions:[{invoice:'in_initial'},{payment_intent:'pi_pass'},{invoice:'in_legacy'}],
  invoicePayments:[{invoice:'in_initial',payment_intent:'pi_sub'},{invoice:'in_renewal',payment_intent:'pi_renewal'}],
  charges:[
   {...good,payment_intent:{id:'pi_sub'},amount_refunded:899},
   {...good,payment_intent:'pi_pass',disputed:true},
   {...good,invoice:{id:'in_legacy'}},
   {...good,payment_intent:'pi_renewal'},
   {...good,payment_intent:'pi_sub',livemode:false},
   {...good,payment_intent:'pi_sub',paid:false,status:'failed'},
   {...good,customer:'same_customer',amount:899},
  ],
 });
 expect(result).toMatchObject({matchedCheckoutCharges:3,matchedFailedCheckoutCharges:1,refundedMatchedCheckoutCharges:1,disputedMatchedCheckoutCharges:1});
 expect(JSON.stringify(result)).not.toMatch(/pi_sub|in_initial|same_customer/);
});


it('counts a v2 monthly purchase as any-plan conversion without calling it an Exam Pass conversion', () => {
 const base={events:[
  {user_id:'a',event:'exam_pass_offer_view',offer_version:'feedback_value_v2',created_at:date(2)},
  {user_id:'a',event:'exam_pass_offer_click',offer_version:'feedback_value_v2',created_at:date(3)},
 ],practice:[{user_id:'a',completed_at:date(1),kind:'ai_score'}],
 sessions:[{...session('monthly','a',4,899),mode:'subscription',metadata:{sku:'monthly'}}],
 fulfillments:[receipt('monthly',4)],offerVersion:'feedback_value_v2',end:'2026-09-20T00:00:00Z',days:28};
 expect(observedOfferPath(base)).toMatchObject({subsequentlyCreatedAnyPlanSession:1,subsequentlyActivatedPositiveAnyPlan:1,subsequentlyCreatedExamPassSession:0,subsequentlyActivatedPositiveExamPass:0});
 expect(observedOfferPath({...base,fulfillments:[]})).toMatchObject({subsequentlyCreatedAnyPlanSession:1,subsequentlyActivatedPositiveAnyPlan:0});
 expect(observedOfferPath({...base,sessions:[{...base.sessions[0],amount_total:0}]}).subsequentlyActivatedPositiveAnyPlan).toBe(0);
 expect(observedOfferPath({...base,sessions:[{...base.sessions[0],created:Date.parse(date(1))/1000}]}).subsequentlyCreatedAnyPlanSession).toBe(0);
});
