import React from 'react';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

// "Guides and tools" block on question pages: 4–6 crawlable links to the
// hubs and tools that give this question context (built server-side by
// lib/siteDirectory.js questionContextLinks and passed in as props).
export default function QuestionContextLinks({ links = [], className = '' }) {
  if (!links.length) return null;
  return (
    <section className={className} aria-labelledby="question-context-links">
      <h2 id="question-context-links" className="text-xl font-bold tracking-tight text-foreground">
        Guides and tools
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <NextLink
              href={link.href}
              className="flex h-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground no-underline transition-colors hover:border-accent/40 hover:text-accent"
            >
              {link.label}
              <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
            </NextLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
