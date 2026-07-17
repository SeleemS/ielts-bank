import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';

// Accessible, centered modal in the shadcn visual language (portal + overlay),
// mirroring the Sheet primitive's implementation to avoid new dependencies.
export default function SignInDialog({
  open,
  onOpenChange,
  title = 'Sign in to save your progress',
  description = 'Track your scores across devices. No password required.',
  trigger = 'site',
}) {
  const { signInWithEmail } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  // Reset transient state whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setStatus('idle');
      setErrorMsg('');
      track('signin_gate_shown', { trigger, signed_in: false });
    }
  }, [open, trigger]);

  if (!mounted || !open) return null;

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    track('login_start', { method: 'email', trigger, signed_in: false });
    setStatus('sending');
    setErrorMsg('');
    try {
      const { error } = await signInWithEmail(email.trim());
      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'Something went wrong. Please try again.');
        return;
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || 'Something went wrong. Please try again.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000]">
      {/* Overlay */}
      <div
        onClick={() => onOpenChange?.(false)}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-[2001] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signin-title"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl',
            'animate-in fade-in zoom-in-95 duration-200'
          )}
        >
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>

          {status === 'sent' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <CheckCircle2 className="h-7 w-7 text-accent" />
              </span>
              <h2 id="signin-title" className="text-xl font-bold tracking-tight text-foreground">
                Check your email
              </h2>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to{' '}
                <span className="font-medium text-foreground">{email.trim()}</span>. Click it to
                sign in — you can close this window.
              </p>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => setStatus('idle')}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-1.5 text-left">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </span>
                <h2
                  id="signin-title"
                  className="mt-2 text-xl font-bold tracking-tight text-foreground"
                >
                  {title}
                </h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>

              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === 'sending'}
                  />
                </div>

                {status === 'error' && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {errorMsg}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={status === 'sending' || !email.trim()}
                >
                  {status === 'sending' ? 'Sending…' : 'Send magic link'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
