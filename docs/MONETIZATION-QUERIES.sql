-- IELTS Bank monetization operating queries
-- Run in the Supabase SQL editor with service-role/database-owner access.

-- 1) Weekly funnel. The actor key works before and after login; authenticated
-- events use user_id while anonymous events fall back to the durable anon_id.
with weekly as (
  select
    date_trunc('week', created_at)::date as week_start,
    event,
    coalesce(user_id::text, anon_id) as actor
  from public.activity_events
  where created_at >= date_trunc('week', now()) - interval '12 weeks'
    and event in (
      'signup_verified',
      'paywall_view',
      'checkout_start',
      'purchase_success',
      'subscription_activated',
      'subscription_canceled'
    )
),
funnel as (
  select
    week_start,
    count(distinct actor) filter (where event = 'signup_verified') as signups,
    count(distinct actor) filter (where event = 'paywall_view') as paywall_viewers,
    count(distinct actor) filter (where event = 'checkout_start') as checkout_starters,
    count(distinct actor) filter (where event = 'purchase_success') as purchase_returners,
    count(distinct actor) filter (where event = 'subscription_activated') as activated_buyers,
    count(distinct actor) filter (where event = 'subscription_canceled') as canceled_buyers
  from weekly
  group by week_start
)
select
  *,
  round(100.0 * checkout_starters / nullif(paywall_viewers, 0), 1) as paywall_to_checkout_pct,
  round(100.0 * activated_buyers / nullif(checkout_starters, 0), 1) as checkout_to_paid_pct,
  round(100.0 * activated_buyers / nullif(signups, 0), 1) as signup_to_paid_pct
from funnel
order by week_start desc;

-- 2) Revenue-event mix by SKU, geography, and PPP flag. amount is stored in
-- Stripe's minor currency unit (for USD, cents).
select
  date_trunc('week', created_at)::date as week_start,
  coalesce(props->>'sku', 'unknown') as sku,
  coalesce(country, 'unknown') as country,
  coalesce(props->>'ppp', 'unknown') as ppp,
  count(*) as activations,
  sum(coalesce((props->>'amount')::bigint, 0)) as gross_minor_units
from public.activity_events
where event = 'subscription_activated'
  and created_at >= date_trunc('week', now()) - interval '12 weeks'
group by 1, 2, 3, 4
order by week_start desc, activations desc;

-- 3) Paywall source effectiveness.
select
  date_trunc('week', created_at)::date as week_start,
  coalesce(props->>'source', 'unknown') as source,
  count(*) filter (where event = 'paywall_view') as views,
  count(*) filter (where event = 'paywall_upgrade_click') as upgrade_clicks,
  count(*) filter (where event = 'checkout_start') as checkout_starts
from public.activity_events
where event in ('paywall_view', 'paywall_upgrade_click', 'checkout_start')
  and created_at >= date_trunc('week', now()) - interval '12 weeks'
group by 1, 2
order by week_start desc, views desc;
