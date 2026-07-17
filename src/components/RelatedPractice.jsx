import React from 'react';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';

export default function RelatedPractice({ skill, items = [], className = '' }) {
  if (!items.length) return null;
  const label = skill.charAt(0).toUpperCase() + skill.slice(1);
  return (
    <section className={className} aria-labelledby={`related-${skill}`}>
      <h2 id={`related-${skill}`} className="text-xl font-bold tracking-tight text-foreground">
        Keep practising
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Build consistency with another {label} practice item.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <Card key={item.id} className="h-full transition-colors hover:border-accent/40">
            <CardContent className="flex h-full flex-col p-4">
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              {item.difficulty ? (
                <p className="mt-1 text-xs capitalize text-muted-foreground">{item.difficulty}</p>
              ) : null}
              <NextLink
                href={`/${skill}question/${item.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline"
              >
                Practise next <ArrowRight className="h-4 w-4" />
              </NextLink>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
