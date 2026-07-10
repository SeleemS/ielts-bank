import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

// Google "G" mark (inline SVG so it works under the strict, self-contained CSP).
function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// Accessible, centered modal in the shadcn visual language (portal + overlay),
// mirroring the Sheet primitive's implementation to avoid new dependencies.
export default function SignInDialog({ open, onOpenChange }) {
  const { signInWithEmail, signInWithGoogle } = useAuth();
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
    }
  }, [open]);

  if (!mounted || !open) return null;

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
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

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || 'Could not start Google sign-in. Please try again.');
    }
  };

  return createPortal(
    <div className="tw-root fixed inset-0 z-[2000]">
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
                  Sign in to save your progress
                </h2>
                <p className="text-sm text-muted-foreground">
                  Track your scores across devices. No password required.
                </p>
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

              <div className="my-5 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  or
                </span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
              >
                <GoogleIcon className="h-[18px] w-[18px]" />
                Continue with Google
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
