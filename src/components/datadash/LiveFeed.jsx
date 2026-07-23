import * as React from 'react';
import { T, flagEmoji, timeAgo } from './theme';
import { aliasFor } from './aliases';

const GOAL_EVENTS = new Set([
  'purchase_success', 'subscription_activated', 'checkout_start', 'signup_verified',
  'paywall_upgrade_click',
]);

const VERB = {
  page_view: 'visited',
  question_open: 'opened',
  question_answer: 'answered in',
  attempt_start: 'started',
  attempt_submit: 'submitted',
  writing_submit: 'submitted an essay in',
  speaking_submit: 'submitted speaking in',
  speaking_record_complete: 'recorded speaking in',
  audio_play: 'played audio in',
  audio_complete: 'finished audio in',
  login: 'signed in at',
  login_start: 'started sign-in at',
  signup_start: 'started sign-up at',
  signup_verified: 'JOINED from',
  signin_gate_shown: 'saw the sign-in gate at',
  premium_gate: 'hit the premium gate at',
  free_limit_gate: 'hit the free limit at',
  paywall_view: 'viewed the paywall at',
  mock_paywall_shown: 'saw the mock paywall at',
  paywall_upgrade_click: 'CLICKED UPGRADE at',
  checkout_start: 'STARTED CHECKOUT at',
  purchase_success: 'PURCHASED at',
  subscription_activated: 'activated a plan',
  ai_score_result: 'got an AI score in',
  writing_score_server: 'writing scored in',
  estimator_start: 'started the band estimator',
  estimator_complete: 'finished the band estimator',
  modal_open: 'opened a modal at',
  modal_close: 'closed a modal at',
  form_submit: 'submitted a form at',
  onboarding_answered: 'answered onboarding',
};

// Rolling feed of the latest meaningful events (heartbeats / raw clicks are
// filtered server-side). Visitors appear as stable anonymized aliases; rows
// that arrived since the previous poll slide in and carry an orange dot.
// `fill` stretches the list to its parent (which must be a sized flex child);
// otherwise the list scrolls within maxHeight.
export default function LiveFeed({ feed, maxHeight = 420, fill = false }) {
  const seenRef = React.useRef(new Set());
  const newKeys = React.useMemo(() => {
    const fresh = new Set();
    for (const item of feed || []) {
      const key = `${item.at}${item.vh}${item.event}`;
      if (!seenRef.current.has(key)) fresh.add(key);
    }
    return fresh;
  }, [feed]);
  React.useEffect(() => {
    for (const item of feed || []) seenRef.current.add(`${item.at}${item.vh}${item.event}`);
  }, [feed]);

  return (
    <div
      className="space-y-0.5 overflow-y-auto pr-1"
      style={fill ? { height: '100%', maxHeight: '100%' } : { maxHeight }}
    >
      {(feed || []).map((item, index) => {
        const alias = aliasFor(item.vh || item.country || 'anon');
        const goal = GOAL_EVENTS.has(item.event);
        const verb = VERB[item.event] || `${item.event.replaceAll('_', ' ')} at`;
        const target = item.slug || item.path || '/';
        const isNew = newKeys.has(`${item.at}${item.vh}${item.event}`);
        return (
          <div
            key={`${item.at}-${index}`}
            className="relative rounded-md px-1.5 py-[5px] text-[12px] leading-snug"
            style={{
              background: goal ? 'rgba(232,121,79,0.08)' : undefined,
              animation: isNew ? 'dashSlideIn 0.5s ease' : undefined,
            }}
          >
            {isNew && (
              <span
                className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: T.accent }}
              />
            )}
            {/* Signed-in users with a profile name show their real name. */}
            <span className="font-bold" style={{ color: item.name ? T.ink : alias.color }}>
              {item.name || alias.name}
            </span>
            <span style={{ color: T.faint }}> {flagEmoji(item.country)} </span>
            <span style={{ color: goal ? T.accent : T.muted }} className={goal ? 'font-semibold' : undefined}>
              {verb}{' '}
            </span>
            <span className="break-all font-mono text-[11px]" style={{ color: T.ink }}>
              {String(target).slice(0, 38)}
            </span>
            <span className="ml-1.5 tabular-nums text-[10px]" style={{ color: T.faint }}>
              {timeAgo(item.at)}
            </span>
            {item.signed_in ? (
              <span
                className="ml-1.5 rounded px-1 text-[9px] font-bold uppercase tracking-wide"
                style={{ background: 'rgba(90,169,230,0.12)', color: T.line }}
              >
                user
              </span>
            ) : null}
          </div>
        );
      })}
      {!(feed || []).length && (
        <div className="p-3 text-[12px]" style={{ color: T.faint }}>Waiting for events…</div>
      )}
    </div>
  );
}
