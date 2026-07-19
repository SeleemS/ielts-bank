import * as React from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../lib/utils';
import { track } from '../lib/analytics';
import { useAuth } from '../lib/auth';

// Email-capture widget. POSTs to /api/newsletter/subscribe, which always
// returns {ok:true} for a validly-formatted address (no enumeration), so on a
// 200 we show the same success state regardless of whether the email was new.
//
// Props:
//   source   — string tag stored with the subscription (e.g. 'footer',
//              'writing-checker', 'blog:<slug>') so we can see where sign-ups
//              come from.
//   variant  — 'full' (default) renders heading + subline; 'compact' renders a
//              tight inline form for the footer.
//   className — extra classes on the wrapper.
export default function NewsletterSignup({
  source = 'site',
  variant = 'full',
  className,
}) {
  const compact = variant === 'compact';
  const { user } = useAuth();
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (res.ok && data && data.ok) {
        setStatus('sent');
        track('newsletter_subscribe', {
          source,
          outcome: 'success',
          signed_in: Boolean(user?.id),
          status: res.status,
        });
      } else {
        setStatus('error');
        setErrorMsg(
          (data && data.error) || 'Something went wrong. Please try again.'
        );
        track('newsletter_subscribe', {
          source,
          outcome: 'error',
          signed_in: Boolean(user?.id),
          status: res.status,
        });
      }
    } catch {
      setStatus('error');
      setErrorMsg('A network error occurred. Please try again.');
      track('newsletter_subscribe', {
        source,
        outcome: 'network_error',
        signed_in: Boolean(user?.id),
        status: 0,
      });
    }
  };

  // ---- Success state -------------------------------------------------------
  if (status === 'sent') {
    if (compact) {
      return (
        <p
          className={cn(
            'flex items-center gap-2 text-sm font-medium text-accent',
            className
          )}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          You&apos;re in — check your inbox
        </p>
      );
    }
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm',
          className
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <CheckCircle2 className="h-7 w-7 text-accent" />
        </span>
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          You&apos;re in — check your inbox
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Thanks for subscribing. We&apos;ll send you new practice tests and study
          tips. You can unsubscribe from any email.
        </p>
      </div>
    );
  }

  // ---- Compact (footer) form ----------------------------------------------
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className={cn('flex flex-col gap-2', className)}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'sending'}
            className="h-10 border-input bg-background text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            variant="accent"
            disabled={status === 'sending' || !email.trim()}
            className="shrink-0"
          >
            {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
          </Button>
        </div>
        {status === 'error' && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errorMsg}
          </p>
        )}
      </form>
    );
  }

  // ---- Full form -----------------------------------------------------------
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8',
        className
      )}
    >
      <div className="flex flex-col gap-1.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </span>
        <h3 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          Get new practice tests in your inbox
        </h3>
        <p className="text-sm text-muted-foreground">
          One useful email a week. No spam, unsubscribe anytime.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
          className="sm:flex-1"
        />
        <Button
          type="submit"
          variant="accent"
          disabled={status === 'sending' || !email.trim()}
          className="shrink-0"
        >
          {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
        </Button>
      </form>

      {status === 'error' && (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
