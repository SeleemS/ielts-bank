import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Mail,
  ShieldCheck,
  GraduationCap,
  Briefcase,
  Globe2,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../../lib/supabase';
import { track } from '../../lib/analytics';
import { inter } from '../../lib/fonts';

// Auth + onboarding dialog. Keeps the historical SignInDialog prop contract
// (open / onOpenChange / title / description / trigger) so every existing
// sign-in gate gets the new flow.
//
// Flow (all in this one modal — the user never leaves the page, so "return
// to where they were" is free):
//   1. account  — email + password; Create account (default) or Sign in.
//   2. verify   — 6-digit emailed code (OTP only, no magic links; the
//                 Supabase email templates must render {{ .Token }}).
//   3. about    — two quick questions (goal + target band) saved to the
//                 users row (target_band column + prefs jsonb). Skippable.
// Existing users signing in with a password skip 2–3 entirely. Accounts from
// the magic-link era (no password) sign in via an emailed one-time code.

const GOALS = [
  { key: 'study', label: 'Study abroad', icon: GraduationCap },
  { key: 'work', label: 'Work / visa', icon: Briefcase },
  { key: 'immigration', label: 'Immigration', icon: Globe2 },
  { key: 'general', label: 'General English', icon: Sparkles },
];
const BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0+'];

function currentPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

// Merge goal + target band into the signed-in user's row. Fails soft — the
// worst outcome is an unanswered onboarding question.
async function saveProfile(userId, { goal, band }) {
  if (!userId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.from('users').select('prefs').eq('id', userId).maybeSingle();
    const prefs = data?.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : {};
    if (goal) prefs.goal = goal;
    const patch = { prefs };
    if (band) patch.target_band = parseFloat(band); // '8.0+' -> 8
    await supabase.from('users').update(patch).eq('id', userId);
  } catch {
    /* non-fatal */
  }
}

export default function SignInDialog({
  open,
  onOpenChange,
  title = 'Create your free account',
  description = 'Save your scores and progress across devices.',
  trigger = 'site',
}) {
  const {
    user,
    signInWithEmail,
    signUpWithPassword,
    signInWithPassword,
    verifyEmailOtp,
    resendSignupEmail,
  } = useAuth();

  const [mounted, setMounted] = React.useState(false);
  const [mode, setMode] = React.useState('signup'); // signup | signin
  const [step, setStep] = React.useState('account'); // account | verify | about
  // What triggered the verify step — decides how "Resend code" re-sends:
  // 'signup' -> confirmation email, 'signin' -> one-time sign-in code.
  const [verifySource, setVerifySource] = React.useState('signup');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [band, setBand] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => setMounted(true), []);

  // Reset whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setMode('signup');
      setStep('account');
      setVerifySource('signup');
      setPassword('');
      setCode('');
      setGoal('');
      setBand('');
      setBusy(false);
      setErrorMsg('');
      setNotice('');
      track('signin_gate_shown', { trigger, signed_in: false });
    }
  }, [open, trigger]);

  // Esc + scroll lock.
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

  // Safety net: if a session appears in another tab while we sit on the
  // verify step (e.g. an old emailed link), supabase-js syncs it here —
  // continue without requiring the code.
  React.useEffect(() => {
    if (open && step === 'verify' && user?.id) {
      setErrorMsg('');
      if (verifySource === 'signin') {
        track('login_success', { method: 'email_otp', trigger });
        onOpenChange?.(false);
      } else {
        track('signup_verified', { trigger, method: 'link' });
        setStep('about');
      }
    }
  }, [open, step, user?.id, verifySource, trigger, onOpenChange]);

  // Resend cooldown ticker.
  React.useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (!mounted || !open) return null;

  const close = () => onOpenChange?.(false);

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) return;
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    try {
      if (mode === 'signup') {
        track('signup_start', { method: 'password', trigger, signed_in: false });
        const { data, error } = await signUpWithPassword(trimmed, password, currentPath());
        if (error) {
          setErrorMsg(error.message || 'Could not create your account. Please try again.');
          return;
        }
        // Supabase obfuscates existing accounts: user comes back with no
        // identities. Route those people to sign-in instead.
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('signin');
          setNotice('You already have an account — sign in below.');
          return;
        }
        // Some projects auto-confirm; if a session exists, skip verification.
        if (data?.session) {
          track('signup_verified', { trigger, method: 'auto' });
          setStep('about');
          return;
        }
        setVerifySource('signup');
        setResendIn(30);
        setStep('verify');
      } else {
        track('login_start', { method: 'password', trigger, signed_in: false });
        const { error } = await signInWithPassword(trimmed, password);
        if (error) {
          // Unconfirmed account: push them into the verify step instead of a
          // dead-end error.
          if (/email not confirmed/i.test(error.message || '')) {
            await resendSignupEmail(trimmed, currentPath());
            setVerifySource('signup');
            setResendIn(30);
            setStep('verify');
            return;
          }
          setErrorMsg(
            /invalid login credentials/i.test(error.message || '')
              ? 'Email or password is incorrect. If you signed up before we added passwords, use the emailed code option below.'
              : error.message || 'Could not sign you in. Please try again.'
          );
          return;
        }
        track('login_success', { method: 'password', trigger });
        close();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const { error } = await verifyEmailOtp(
        email.trim(),
        token,
        verifySource === 'signin' ? 'email' : 'signup'
      );
      if (error) {
        setErrorMsg('That code didn’t work. Check the latest email or resend a fresh one.');
        return;
      }
      if (verifySource === 'signin') {
        // Existing account signing in with a code — no onboarding questions.
        track('login_success', { method: 'email_otp', trigger });
        close();
        return;
      }
      track('signup_verified', { trigger, method: 'otp' });
      setStep('about');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setResendIn(30);
    setErrorMsg('');
    const { error } =
      verifySource === 'signin'
        ? await signInWithEmail(email.trim())
        : await resendSignupEmail(email.trim(), currentPath());
    if (error) setErrorMsg(error.message || 'Could not resend the email. Please try again.');
  };

  // Passwordless sign-in for magic-link-era accounts: email a one-time code,
  // verified in the same modal (no link round-trip).
  const handleEmailCode = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      track('login_start', { method: 'email_otp', trigger, signed_in: false });
      const { error } = await signInWithEmail(email.trim());
      if (error) {
        setErrorMsg(error.message || 'Could not send the code. Please try again.');
        return;
      }
      setVerifySource('signin');
      setResendIn(30);
      setCode('');
      setStep('verify');
    } finally {
      setBusy(false);
    }
  };

  const handleAboutSubmit = async (skipped) => {
    setBusy(true);
    try {
      if (!skipped) await saveProfile(user?.id, { goal, band });
      track('onboarding_answered', {
        trigger,
        skipped: Boolean(skipped),
        goal: skipped ? null : goal || null,
        target_band: skipped ? null : band || null,
      });
    } finally {
      setBusy(false);
      close();
    }
  };

  const header = (icon, heading, sub) => (
    <div className="mb-5 flex flex-col gap-1.5 text-left">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10">
        {icon}
      </span>
      <h2 id="signin-title" className="mt-2 text-xl font-bold tracking-tight text-foreground">
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );

  const chip = (selected) =>
    cn(
      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      selected
        ? 'border-accent bg-accent/10 text-foreground'
        : 'border-input text-muted-foreground hover:border-accent/50 hover:text-foreground'
    );

  let body;
  if (step === 'verify') {
    body = (
      <>
        {header(
          <ShieldCheck className="h-5 w-5 text-primary" />,
          verifySource === 'signin' ? 'Enter your sign-in code' : 'Confirm your email',
          <>
            Enter the 6-digit code we sent to{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>.
          </>
        )}
        <form onSubmit={handleVerifySubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-otp">Verification code</Label>
            <Input
              id="signin-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="text-center text-lg font-semibold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
              autoFocus
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button type="submit" variant="accent" className="w-full" disabled={busy || code.length < 6}>
            {busy ? 'Verifying…' : verifySource === 'signin' ? 'Sign in' : 'Verify email'}
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendIn > 0}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-60 disabled:hover:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        </form>
      </>
    );
  } else if (step === 'about') {
    body = (
      <>
        {header(
          <Sparkles className="h-5 w-5 text-primary" />,
          'Two quick questions',
          'We’ll tailor your practice — takes five seconds.'
        )}
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">What are you preparing for?</p>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" onClick={() => setGoal(key)} className={chip(goal === key)}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Target band score?</p>
            <div className="flex flex-wrap gap-2">
              {BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBand(b)}
                  className={cn(chip(band === b), 'min-w-[3.5rem] justify-center tabular-nums')}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="accent"
            className="w-full"
            disabled={busy || (!goal && !band)}
            onClick={() => handleAboutSubmit(false)}
          >
            {busy ? 'Saving…' : 'Start practising'}
          </Button>
          <button
            type="button"
            onClick={() => handleAboutSubmit(true)}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Skip for now
          </button>
        </div>
      </>
    );
  } else {
    // account step
    body = (
      <>
        {header(
          <Mail className="h-5 w-5 text-primary" />,
          mode === 'signup' ? title : 'Welcome back',
          mode === 'signup' ? description : 'Sign in to pick up where you left off.'
        )}
        {notice && (
          <p className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-foreground">
            {notice}
          </p>
        )}
        <form onSubmit={handleAccountSubmit} className="flex flex-col gap-3">
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
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMsg}
            </p>
          )}
          <Button
            type="submit"
            variant="accent"
            className="w-full"
            disabled={busy || !email.trim() || password.length < 8}
          >
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-1.5 text-center text-sm text-muted-foreground">
          {mode === 'signup' ? (
            <button
              type="button"
              className="font-medium underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setMode('signin');
                setErrorMsg('');
                setNotice('');
              }}
            >
              Already have an account? Sign in
            </button>
          ) : (
            <>
              <button
                type="button"
                className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg('');
                  setNotice('');
                }}
              >
                New here? Create an account
              </button>
              <button
                type="button"
                disabled={busy || !email.trim()}
                className="font-medium underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
                onClick={handleEmailCode}
              >
                Email me a one-time code instead
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    // The portal mounts on document.body, outside the app's font wrapper —
    // re-apply the Inter variable + font-sans here or the dialog falls back
    // to the browser serif font.
    <div className={cn('fixed inset-0 z-[2000]', inter.variable, 'font-sans')}>
      <div
        onClick={close}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      />
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
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
}
