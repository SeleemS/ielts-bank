import * as React from 'react';
import { T, SKILL_COLOR, flagEmoji, countryName, timeAgo } from './theme';

const EVENT_LABEL = {
  page_view: 'viewed a page',
  question_open: 'opened a question',
  question_answer: 'answered a question',
  attempt_start: 'started an attempt',
  attempt_submit: 'submitted an attempt',
  writing_submit: 'submitted an essay',
  speaking_submit: 'submitted speaking',
  speaking_record_complete: 'recorded speaking',
  audio_play: 'played audio',
  audio_complete: 'finished audio',
  login: 'signed in',
  login_start: 'started sign-in',
  signup_start: 'started sign-up',
  signup_verified: 'verified sign-up',
  signin_gate_shown: 'saw the sign-in gate',
  premium_gate: 'hit the premium gate',
  free_limit_gate: 'hit the free limit',
  paywall_view: 'viewed the paywall',
  mock_paywall_shown: 'saw the mock paywall',
  paywall_upgrade_click: 'clicked upgrade',
  checkout_start: 'started checkout',
  purchase_success: 'PURCHASED',
  subscription_activated: 'subscription activated',
  ai_score_result: 'got an AI score',
  writing_score_server: 'writing scored',
  estimator_start: 'started band estimator',
  estimator_complete: 'finished band estimator',
  modal_open: 'opened a modal',
  modal_close: 'closed a modal',
  form_submit: 'submitted a form',
  ui_feedback: 'gave UI feedback',
  field_change: 'edited a field',
  onboarding_answered: 'answered onboarding',
  sale_reminder_shown: 'saw the sale reminder',
};

const HIGHLIGHT = new Set(['purchase_success', 'subscription_activated', 'checkout_start', 'signup_verified']);

// Rolling feed of the latest non-noise events (heartbeats and raw ui clicks
// are filtered server-side).
export default function LiveFeed({ feed, tick }) {
  return (
    <div className="max-h-[430px] space-y-0.5 overflow-y-auto pr-1" data-tick={tick}>
      {(feed || []).map((item, index) => {
        const highlight = HIGHLIGHT.has(item.event);
        const skillColor = item.skill ? SKILL_COLOR[item.skill] : null;
        return (
          <div
            key={`${item.at}-${index}`}
            className="flex items-center gap-2 rounded-md px-1.5 py-[5px] text-[12px]"
            style={highlight ? { background: 'rgba(12,163,12,0.08)' } : undefined}
          >
            <span title={countryName(item.country)} className="text-[13px] leading-none">
              {flagEmoji(item.country)}
            </span>
            <span className="min-w-0 flex-1 truncate" style={{ color: highlight ? T.ink : T.ink2 }}>
              <span className={highlight ? 'font-semibold' : undefined}>
                {EVENT_LABEL[item.event] || item.event.replaceAll('_', ' ')}
              </span>
              {item.skill ? (
                <span className="ml-1.5" style={{ color: skillColor || T.muted }}>
                  {item.skill}
                </span>
              ) : null}
              {item.slug ? (
                <span className="ml-1.5" style={{ color: T.muted }}>
                  {String(item.slug).slice(0, 34)}
                </span>
              ) : item.path ? (
                <span className="ml-1.5" style={{ color: T.muted }}>
                  {String(item.path).slice(0, 34)}
                </span>
              ) : null}
            </span>
            {item.signed_in ? (
              <span
                className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: T.blueSoft, color: T.blue }}
              >
                user
              </span>
            ) : null}
            <span className="shrink-0 tabular-nums text-[10px]" style={{ color: T.muted }}>
              {timeAgo(item.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
