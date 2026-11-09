import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase';
import { getSessionAccess } from '../../lib/sessionAccess';
import { gaClientId, track } from '../../lib/analytics';
import { useAuth } from '../../lib/auth';
import { useVisitorMarket } from '../../lib/useVisitorMarket';
import { REPORT_UNLOCK_ENABLED, money, reportUnlockPrice } from '../../lib/saleConfig';

// "Just this report": one payment opens the full saved Writing report without
// a plan. Sits under the plan buttons as the smaller, secondary choice. The
// price shown follows the visitor's market; the server re-resolves it.
export default function ReportUnlockButton({ reportId, source = 'score_tease', className = '' }) {
  const { user } = useAuth();
  const { ppp, ready } = useVisitorMarket();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const viewed = React.useRef(false);
  const signedIn = Boolean(user && !user.is_anonymous);
  const show = REPORT_UNLOCK_ENABLED && Boolean(reportId) && signedIn && ready;

  React.useEffect(() => {
    if (!show || viewed.current) return;
    viewed.current = true;
    track('report_unlock_view', { source, ppp });
  }, [show, source, ppp]);

  if (!show) return null;
  const price = money(reportUnlockPrice(ppp));

  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    track('checkout_start', { sku: 'report_unlock', source, ppp, direct: true });
    try {
      const { accessToken } = await getSessionAccess(getSupabase);
      if (!accessToken) {
        setError('Please sign in again to unlock this report.');
        return;
      }
      const response = await fetch('/api/billing/report-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reportId, ga_cid: gaClientId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        track('checkout_redirect_attempt', { sku: 'report_unlock', source, direct: true });
        window.location.assign(body.url);
        return;
      }
      if (response.ok && body.unlocked) {
        window.location.reload();
        return;
      }
      track('checkout_client_failed', { sku: 'report_unlock', source, direct: true, http_status: response.status });
      setError(body.error || 'Could not start checkout. Please try again.');
    } catch {
      track('checkout_client_failed', { sku: 'report_unlock', source, direct: true, failure_stage: 'network' });
      setError('Could not start checkout. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        Only need this one?{' '}
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-1.5 font-semibold text-accent underline underline-offset-2 hover:text-accent/80 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Unlock just this report for {price}
        </button>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        One payment, never renews. Opens the full feedback on this essay only; it does not include new scores.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
