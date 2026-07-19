import * as React from 'react';
import NextLink from 'next/link';
import { CalendarClock, Check, CreditCard, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { getSupabase } from '../../../lib/supabase';
import { isPremiumActive } from '../../lib/usePlan';
import { getInitials } from './utils';

function Feedback({ type, children }) {
  if (!children) return null;
  return (
    <p role={type === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {children}
    </p>
  );
}

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span>
      <div><h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div>
    </div>
  );
}

function ProfileSettings({ user, profile, onProfileChange }) {
  const [displayName, setDisplayName] = React.useState(profile.display_name || '');
  const [targetBand, setTargetBand] = React.useState(profile.target_band == null ? '' : String(profile.target_band));
  const [weeklyGoal, setWeeklyGoal] = React.useState(String(profile.prefs?.dashboardWeeklyGoal || 3));
  const [examDate, setExamDate] = React.useState(profile.exam_date || profile.prefs?.examDate || '');
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState({ type: '', message: '' });

  React.useEffect(() => {
    setDisplayName(profile.display_name || '');
    setTargetBand(profile.target_band == null ? '' : String(profile.target_band));
    setWeeklyGoal(String(profile.prefs?.dashboardWeeklyGoal || 3));
    setExamDate(profile.exam_date || profile.prefs?.examDate || '');
  }, [profile]);

  async function saveProfile(event) {
    event.preventDefault();
    setFeedback({ type: '', message: '' });
    const trimmed = displayName.trim();
    if (trimmed.length > 80) {
      setFeedback({ type: 'error', message: 'Display name must be 80 characters or fewer.' });
      return;
    }
    const nextProfile = {
      display_name: trimmed || null,
      target_band: targetBand === '' ? null : Number(targetBand),
      exam_date: examDate || null,
      prefs: {
        ...(profile.prefs || {}),
        dashboardWeeklyGoal: Number(weeklyGoal),
        examDate: examDate || null,
      },
    };
    setBusy(true);
    try {
      const { data, error } = await getSupabase()
        .from('users')
        .update(nextProfile)
        .eq('id', user.id)
        .select('display_name, target_band, exam_date, prefs')
        .maybeSingle();
      if (error || !data) {
        setFeedback({ type: 'error', message: error?.message || 'Could not save your profile.' });
        return;
      }
      onProfileChange(data);
      setFeedback({ type: 'success', message: 'Your learning preferences are saved.' });
    } catch {
      setFeedback({ type: 'error', message: 'Could not save your profile. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7">
      <SectionHeader icon={UserRound} title="Profile & learning goal" description="Personalize the scores, targets, and study rhythm shown on your dashboard." />
      <form onSubmit={saveProfile} className="mt-7 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="dashboard-name">Display name</Label><Input id="dashboard-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we greet you?" maxLength={80} className="h-11 rounded-xl" /></div>
          <div className="space-y-2"><Label htmlFor="dashboard-email">Email address</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="dashboard-email" value={user.email || ''} disabled className="h-11 rounded-xl bg-slate-50 pl-9" /></div></div>
          <div className="space-y-2"><Label htmlFor="dashboard-target">Target IELTS band</Label><Select id="dashboard-target" value={targetBand} onChange={(event) => setTargetBand(event.target.value)} className="h-11 rounded-xl"><option value="">Not set yet</option>{Array.from({ length: 13 }, (_, index) => 3 + index * 0.5).map((band) => <option key={band} value={band}>{band.toFixed(1)}</option>)}</Select></div>
          <div className="space-y-2"><Label htmlFor="dashboard-goal">Weekly submission goal</Label><Select id="dashboard-goal" value={weeklyGoal} onChange={(event) => setWeeklyGoal(event.target.value)} className="h-11 rounded-xl">{[2, 3, 5, 7, 10].map((goal) => <option key={goal} value={goal}>{goal} submissions per week</option>)}</Select></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="dashboard-exam-date">Exam date <span className="font-normal text-slate-400">(optional)</span></Label><div className="relative sm:max-w-xs"><CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="dashboard-exam-date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="h-11 rounded-xl pl-9" /></div></div>
        </div>
        <Feedback type={feedback.type}>{feedback.message}</Feedback>
        <div className="flex justify-end"><Button type="submit" variant="accent" disabled={busy} className="rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save preferences</Button></div>
      </form>
    </section>
  );
}

function PasswordSettings() {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState({ type: '', message: '' });

  async function updatePassword(event) {
    event.preventDefault();
    setFeedback({ type: '', message: '' });
    if (password.length < 8) {
      setFeedback({ type: 'error', message: 'Use at least 8 characters for your new password.' });
      return;
    }
    if (password !== confirm) {
      setFeedback({ type: 'error', message: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) {
        setFeedback({ type: 'error', message: error.message || 'Could not update your password.' });
        return;
      }
      setPassword('');
      setConfirm('');
      setFeedback({ type: 'success', message: 'Password updated successfully.' });
    } catch {
      setFeedback({ type: 'error', message: 'Could not update your password. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7">
      <SectionHeader icon={KeyRound} title="Password & security" description="Set a strong password for direct sign-in to this account." />
      <form onSubmit={updatePassword} className="mt-7 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="dashboard-password">New password</Label><div className="relative"><Input id="dashboard-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} className="h-11 rounded-xl pr-10" /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div className="space-y-2"><Label htmlFor="dashboard-password-confirm">Confirm password</Label><Input id="dashboard-password-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} className="h-11 rounded-xl" /></div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Use a unique password with at least 8 characters. Your password is sent directly to the authentication service and is never stored in this page.</span></div>
        <Feedback type={feedback.type}>{feedback.message}</Feedback>
        <div className="flex justify-end"><Button type="submit" disabled={busy} className="rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update password</Button></div>
      </form>
    </section>
  );
}

function PlanSettings({ profile }) {
  const isPremium = isPremiumActive(
    profile.plan,
    profile.plan_status,
    profile.plan_renews_at,
    profile.plan_expires_at,
    profile.billing_pause_until
  );

  return (
    <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-[0_24px_65px_-35px_rgba(2,6,23,0.9)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-emerald-300"><Sparkles className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Membership</span></div><h2 className="mt-3 text-2xl font-black">{isPremium ? 'Premium plan' : 'Free plan'}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{isPremium ? 'Your premium learning tools are active.' : 'Upgrade for daily fair-use AI feedback, full mock tests, and live examiner minutes.'}</p></div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300"><CreditCard className="h-5 w-5" /></span>
      </div>
      {profile.plan_renews_at && <p className="mt-5 text-xs text-slate-400">{profile.plan_status === 'canceled' ? 'Access until' : 'Renews'} {new Date(profile.plan_renews_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      <div className="mt-6">
        {isPremium ? <Button asChild variant="secondary" className="w-full rounded-xl"><NextLink href="/billing/manage" className="no-underline">Manage billing</NextLink></Button> : <Button asChild variant="accent" className="w-full rounded-xl"><NextLink href="/pricing" className="no-underline"><Sparkles className="h-4 w-4" /> Explore Premium</NextLink></Button>}
      </div>
    </section>
  );
}

export default function AccountSettings({ user, profile, onProfileChange, onSignOut }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-slate-950 px-5 py-7 text-white shadow-[0_25px_70px_-38px_rgba(5,150,105,0.85)] sm:px-8">
        <div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-black ring-1 ring-white/20">{getInitials(profile.display_name, user.email)}</span><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Account center</p><h2 className="mt-1 text-2xl font-black">{profile.display_name || 'IELTS learner'}</h2><p className="mt-0.5 text-sm text-emerald-100/80">{user.email}</p></div></div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.65fr)]">
        <div className="space-y-5"><ProfileSettings user={user} profile={profile} onProfileChange={onProfileChange} /><PasswordSettings /></div>
        <div className="space-y-5">
          <PlanSettings profile={profile} />
          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6">
            <SectionHeader icon={LogOut} title="Session" description="Sign out safely on this device." />
            <Button type="button" variant="outline" onClick={onSignOut} className="mt-6 w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"><LogOut className="h-4 w-4" /> Sign out</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
