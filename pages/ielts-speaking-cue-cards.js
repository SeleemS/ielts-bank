// /ielts-speaking-cue-cards — every published IELTS Speaking Part 2 cue card,
// grouped by topic family, newest first, titled for the current topic season.
// Replaces /speaking/new-cue-cards (308 → here, next.config.js).
import React from 'react';
import NextLink from 'next/link';
import { ArrowRight, CalendarDays, Mic } from 'lucide-react';
import {
  SpeakingHubHead,
  SpeakingHubShell,
  SpeakingBreadcrumb,
  QuickAnswer,
  CueCardList,
  DifficultyBadge,
  FamilyChips,
} from '../src/components/SpeakingHub';
// Server-only: referenced ONLY inside getStaticProps.
import { listSpeakingHubItems } from '../lib/speakingHubs';
import { buildCueCardHub, buildCueCardHubJsonLd, cueCardHubSeo } from '../lib/cueCardHub';

function CueCardGrid({ items }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((card) => (
        <li key={card.slug} className="list-none">
          <NextLink
            href={card.href}
            className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
          >
            <span className="text-sm font-semibold leading-snug text-foreground group-hover:text-accent">
              {card.topic}
            </span>
            {card.bullets.length ? (
              <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                You should say: {card.bullets.join(' · ')}
              </span>
            ) : null}
            <span className="mt-3 flex items-center justify-between gap-2">
              <DifficultyBadge difficulty={card.difficulty} />
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                Practise with model answer
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export default function SpeakingCueCardsHub({ hub, seo, jsonLd }) {
  const answer =
    `These are ${hub.total} free IELTS Speaking Part 2 practice cue cards in the style of the ${hub.season.label} topic season, ` +
    `grouped by topic and listed newest first. They are original IELTS-Bank practice cards, not questions reported from real tests; ` +
    `each one has examiner audio, a one-minute prep timer and a Band 8–9 model answer.`;

  return (
    <>
      <SpeakingHubHead seo={seo} jsonLd={jsonLd} />
      <SpeakingHubShell>
        <SpeakingBreadcrumb current="Cue cards" />

        <header className="mb-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            Speaking Part 2 · {hub.total} cue cards
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{seo.title}</h1>
          <QuickAnswer>{answer}</QuickAnswer>
          {hub.updatedLabel ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Updated {hub.updatedLabel}
            </p>
          ) : null}
        </header>

        {hub.total === 0 ? (
          <CueCardList items={[]} />
        ) : (
          <div className="space-y-12">
            {hub.recent.length ? (
              <section aria-labelledby="recently-added">
                <h2 id="recently-added" className="mb-1 text-2xl font-bold tracking-tight text-foreground">
                  Recently added cue cards
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {hub.recent.length} card{hub.recent.length === 1 ? '' : 's'} published in {hub.recentMonthLabel}.
                </p>
                <CueCardGrid items={hub.recent} />
              </section>
            ) : null}

            <nav aria-label="Cue card topics" className="rounded-2xl border border-border bg-secondary/40 p-5">
              <p className="text-sm font-semibold text-foreground">Jump to a topic</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {hub.groups.map((group) => (
                  <li key={group.family} className="list-none">
                    <a
                      href={`#topic-${group.family}`}
                      className="inline-block rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground no-underline hover:border-accent/40 hover:text-accent"
                    >
                      {group.label} ({group.items.length})
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {hub.groups.map((group) => (
              <section key={group.family} id={`topic-${group.family}`} aria-labelledby={`topic-${group.family}-title`} className="scroll-mt-20">
                <h2 id={`topic-${group.family}-title`} className="mb-1 text-2xl font-bold tracking-tight text-foreground">
                  {group.label} cue cards
                </h2>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {group.items.length} card{group.items.length === 1 ? '' : 's'}. {group.blurb}
                  {group.hubHref ? (
                    <>
                      {' '}
                      <NextLink href={group.hubHref} className="font-semibold text-accent no-underline">
                        {group.label} topic guide
                      </NextLink>
                    </>
                  ) : null}
                </p>
                <CueCardGrid items={group.items} />
              </section>
            ))}
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-accent/30 bg-accent/5 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">How should you practise a cue card?</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Open a card, listen to the examiner read it, take the full minute of notes, then speak until you are
            stopped at two minutes, covering every point on the card. Compare what you said with the model answer
            afterwards, not before. To practise the whole interview, including Part 3 follow-up questions, try the
            live AI Speaking Examiner.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <NextLink href="/speaking/part-2" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline">
              IELTS Speaking Part 2 guide <ArrowRight className="h-4 w-4" />
            </NextLink>
            <NextLink href="/speaking-examiner" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline">
              AI Speaking Examiner <ArrowRight className="h-4 w-4" />
            </NextLink>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Browse cue cards by topic family</h2>
          <FamilyChips />
        </section>
      </SpeakingHubShell>
    </>
  );
}

export async function getStaticProps() {
  // Like the other skill hubs, a failed fetch throws: during ISR Next keeps
  // serving the last good page instead of publishing an empty one.
  const items = await listSpeakingHubItems();
  const hub = buildCueCardHub(items, new Date());
  const seo = cueCardHubSeo(hub);
  return {
    props: { hub, seo, jsonLd: buildCueCardHubJsonLd(hub, seo) },
    // Hourly, so each imported batch (and a new season) shows up quickly.
    revalidate: 3600,
  };
}
