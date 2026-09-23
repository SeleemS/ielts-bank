import React from 'react';
import NextLink from 'next/link';
import { ChevronRight } from 'lucide-react';

// Visible breadcrumb trail. Pages that render it should also emit the SAME
// trail as BreadcrumbList JSON-LD (see breadcrumbJsonLd) so the structured data
// always describes navigation the reader can see.
//   items: [{ label, href? }] — the last item is the current page (no link).
export default function Breadcrumbs({ items = [], className = '' }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className={`text-sm text-muted-foreground ${className}`}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined} className="truncate text-foreground">
                  {item.label}
                </span>
              ) : (
                <NextLink href={item.href} className="no-underline hover:text-accent">
                  {item.label}
                </NextLink>
              )}
              {!last ? <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
