import React from 'react';
import NextLink from 'next/link';
import { ArrowRight, BookOpen, Headphones, PenLine, Mic, RotateCcw, Target, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { track } from '../../lib/analytics';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/usePlan';
import NewsletterSignup from '../NewsletterSignup';
import SignInDialog from '../auth/SignInDialog';
import { BandHero, bandDescriptor } from '../question/ScoreUI';
import { formatBand } from './score';
import { ESTIMATOR_VERSION } from '../../../lib/estimatorConfig';
import { biggestGap } from './flow';

// Target-band options mirror the onboarding chips in SignInDialog (~line 45).
const TARGET_BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0+'];
const parseTarget = (label) => parseFloat(label); // '8.0+' -> 8

const SKILL_META = {
  reading: { label: 'Reading', icon: BookOpen, href: '/readingquestion' },
  listening: { label: 'Listening', icon: Headphones, href: '/listeningquestion' },
  writing: { label: 'Writing', icon: PenLine, href: '/writingquestion' },
  speaking: { label: 'Speaking', icon: Mic, href: '/speakingquestion' },
};

// A measured-skill card: authoritative point estimate + raw score.
function MeasuredCard({ skill, section, onPractice }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-accent" /> {meta.label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">
          ~{formatBand(section.band)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {section.raw}/{section.total} correct
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Based on {section.total} real questions</p>
      <NextLink
        href={meta.href}
        onClick={onPractice}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent no-underline underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Practice {meta.label.toLowerCase()} <ArrowRight className="h-3 w-3" />
      </NextLink>
    </div>
  );
}

// A self-assessed card: deliberately LESS authoritative than the measured cards
// — dashed outline, hatched range bar, explicit "Self-assessed" tag.
function SelfAssessedCard({ skill, section }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  const { min, max } = section.band;
  const leftPct = (min / 9) * 100;
  const widthPct = ((max - min) / 9) * 100;
  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" /> {meta.label}
        </div>
        <span className="rounded-full border border-muted-foreground/30 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Self-assessed
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        likely {formatBand(min)}–{formatBand(max)}
      </div>
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`Estimated ${meta.label} band range ${formatBand(min)} to ${formatBand(max)}`}
      >
        <div
          className="h-full rounded-full border border-muted-foreground/50"
          style={{
            marginLeft: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.35) 0, hsl(var(--muted-foreground)/0.35) 3px, transparent 3px, transparent 6px)',
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Your estimate, not a measured score.</p>
    </div>
  );
}

// A skipped-skill card: honest "not measured" + practice link.
function SkippedCard({ skill, onPractice }) {
  const meta = SKILL_META[skill];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {meta.label}
      </div>
      <div className="mt-2 text-lg font-semibold text-muted-foreground">Not measured</div>
      <NextLink
        href={meta.href}
        onClick={onPractice}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline underline-offset-4 hover:underline"
      >
        Practice {meta.label.toLowerCase()} to find out <ArrowRight className="h-3.5 w-3.5" />
      </NextLink>
    </div>
  );
}

// A conversion CTA row.
function CtaCard({ icon: Icon, title, body, actionLabel, href, onClick, tone = 'primary' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        tone === 'primary' ? 'border-accent/40 bg-accent/5' : 'border-border bg-card'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'primary' ? 'bg-accent/15 text-accent' : 'bg-secondary text-foreground'
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <div className="text-sm font-bold text-foreground">{title}</div>
          {body ? <p className="mt-0.5 text-sm text-muted-foreground">{body}</p> : null}
        </div>
      </div>
      <Button asChild variant={tone === 'primary' ? 'accent' : 'outline'} className="shrink-0">
        <NextLink href={href} onClick={onClick}>
          {actionLabel} <ArrowRight className="h-4 w-4" />
        </NextLink>
      </Button>
    </div>
  );
}

export default function EstimatorResults({
  reading,
  listening,
  writing,
  speaking,
  overall,
  skipped = {},
  initialTargetBand = 7.0,
  onTargetBandChange,
  onRetake,
}) {
  const { user } = useAuth();
  const { isPremium } = usePlan();
  const signedIn = Boolean(user?.id);
  const [targetBand, setTargetBand] = React.useState(initialTargetBand);
  const [signInOpen, setSignInOpen] = React.useState(false);

  const emit = React.useCallback(
    (event, params = {}) => {
      track(event, { version: ESTIMATOR_VERSION, signed_in: signedIn, ...params });
    },
    [signedIn]
  );

  const ctaClick = React.useCallback(
    (destination) => () => emit('estimator_cta_click', { destination }),
    [emit]
  );

  const bands = {
    reading: reading ? reading.band : null,
    listening: listening ? listening.band : null,
    writing: writing ? writing.band : null,
    speaking: speaking ? speaking.band : null,
  };

  const measuredCount =
    (reading ? reading.total : 0) + (listening ? listening.total : 0);
  const heroCaption =
    measuredCount > 0
      ? `Estimated from ${measuredCount} real test questions + your self-assessment. Not an official score.`
      : 'Estimated from your self-assessment. Not an official score.';

  const handleTarget = (label) => {
    const value = parseTarget(label);
    setTargetBand(value);
    onTargetBandChange?.(value);
  };

  const gap = typeof overall === 'number' ? Math.round((targetBand - overall) * 10) / 10 : null;
  const worst = biggestGap(bands, targetBand);

  const renderCard = (skill) => {
    if (skipped[skill]) {
      return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
    }
    if (skill === 'reading' || skill === 'listening') {
      const section = skill === 'reading' ? reading : listening;
      if (!section) return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
      return <MeasuredCard key={skill} skill={skill} section={section} onPractice={ctaClick(`practice_${skill}`)} />;
    }
    const section = skill === 'writing' ? writing : speaking;
    if (!section) return <SkippedCard key={skill} skill={skill} onPractice={ctaClick(`practice_${skill}`)} />;
    return <SelfAssessedCard key={skill} skill={skill} section={section} />;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Your estimated IELTS band
        </h2>
      </div>

      {/* (a) Overall band hero */}
      <div>
        <BandHero band={typeof overall === 'number' ? overall : undefined} subtitle={heroCaption} />
        <p className="mt-2 text-center text-xs text-muted-foreground">{heroCaption}</p>
        <div className="mt-4">
          <CtaCard
            icon={Sparkles}
            tone="plain"
            title="Confirm this with a full 40-question mock"
            body="A complete timed mock test gives a sharper read than this 20-question snapshot."
            actionLabel="Take a mock test"
            href="/mock-test"
            onClick={ctaClick('mock_test')}
          />
        </div>
      </div>

      {/* (b) Per-skill cards */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Skill by skill
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {['reading', 'listening', 'writing', 'speaking'].map((skill) => renderCard(skill))}
        </div>
      </div>

      {/* (c) Target-band selector + gap */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">What band do you need?</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TARGET_BANDS.map((label) => {
            const selected = parseTarget(label) === targetBand;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleTarget(label)}
                aria-pressed={selected}
                className={cn(
                  'min-w-[3.5rem] justify-center rounded-lg border px-3 py-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-input text-muted-foreground hover:border-accent/50 hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {gap !== null ? (
          <p className="mt-4 text-sm text-foreground">
            {gap > 0 ? (
              <>
                You&apos;re ~{gap.toFixed(1)} band{gap === 1 ? '' : 's'} away from your target.
                {worst ? (
                  <> Biggest gap: <span className="font-semibold">{SKILL_META[worst.skill].label}</span>.</>
                ) : null}
              </>
            ) : (
              <>You&apos;re already at or above your target band — keep it sharp.</>
            )}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Measure at least two skills to see how far you are from your target.
          </p>
        )}
      </div>

      {/* (d) Conversion block */}
      <div className="space-y-3">
        <CtaCard
          icon={PenLine}
          tone="primary"
          title={isPremium ? 'Score your writing' : 'Get your real Writing band'}
          body={
            isPremium
              ? 'Submit an essay and get an examiner-style band with criterion feedback.'
              : 'Self-ratings run about half a band optimistic. Get your real Writing band from AI scoring.'
          }
          actionLabel={isPremium ? 'Score my writing' : 'Get my Writing band'}
          href="/ielts-writing-checker"
          onClick={ctaClick('writing_checker')}
        />
        <CtaCard
          icon={Mic}
          tone="primary"
          title={isPremium ? 'Meet your examiner' : 'Meet the AI examiner'}
          body={
            isPremium
              ? 'Practise a full speaking test with the AI examiner and get a band.'
              : 'Get your Speaking measured in a realistic mock interview with the AI examiner.'
          }
          actionLabel={isPremium ? 'Start speaking' : 'Meet the examiner'}
          href="/speaking-examiner"
          onClick={ctaClick('speaking_examiner')}
        />

        {!signedIn ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <div className="text-sm font-bold text-foreground">Save this as your baseline</div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Create a free account and track your improvement from here.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => {
                emit('estimator_cta_click', { destination: 'save_account' });
                setSignInOpen(true);
              }}
            >
              Save my baseline
            </Button>
          </div>
        ) : null}
      </div>

      {/* Newsletter (last). onSubmit bubbles up from the inner form so we can
          attribute the estimator_cta_click without modifying NewsletterSignup. */}
      <div onSubmit={() => emit('estimator_cta_click', { destination: 'newsletter' })}>
        <NewsletterSignup source="band-estimator" />
      </div>

      {/* Retake */}
      <div className="flex justify-center border-t border-border pt-6">
        <button
          type="button"
          onClick={() => {
            emit('estimator_retake');
            onRetake?.();
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-4 w-4" /> Retake the test
        </button>
      </div>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirectOnFinish={false}
        trigger="estimator_save"
        title="Save your estimate"
        description="Create a free account to keep this baseline and track your progress."
      />
    </div>
  );
}
