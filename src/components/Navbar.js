import React, { useState } from 'react';
import NextLink from 'next/link';
import Image from 'next/image';
import { Menu, ArrowRight, BookOpen, PenLine, Headphones, Newspaper } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../lib/utils';

// Pure Tailwind/shadcn Navbar. NO Chakra imports — this renders on every page,
// including pages still built with Chakra, so it must be self-contained.

const NAV_LINKS = [
  { label: 'Reading', href: '/readingquestion', icon: BookOpen },
  { label: 'Writing', href: '/writingquestion', icon: PenLine },
  { label: 'Listening', href: '/listeningquestion', icon: Headphones },
  { label: 'Blog', href: '/blog', icon: Newspaper },
];

function BrandMark() {
  return (
    <NextLink href="/" className="flex items-center gap-2.5 no-underline">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-primary/5 ring-1 ring-primary/10">
        <Image src="/image.png" alt="IELTS-Bank logo" width={28} height={28} className="h-7 w-7 object-contain" />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">
        IELTS<span className="text-accent">-Bank</span>
      </span>
    </NextLink>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="tw-root sticky top-0 z-[1000] w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors',
                'hover:bg-secondary hover:text-foreground'
              )}
            >
              {link.label}
            </NextLink>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          <Button asChild variant="accent" className="shadow-sm">
            <NextLink href="/readingquestion" className="no-underline">
              Start practicing
              <ArrowRight className="h-4 w-4" />
            </NextLink>
          </Button>
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" onClose={() => setOpen(false)}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              IELTS<span className="text-accent">-Bank</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-2 flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <NextLink
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium text-foreground no-underline transition-colors hover:bg-secondary"
                >
                  <Icon className="h-5 w-5 text-accent" />
                  {link.label}
                </NextLink>
              );
            })}
          </nav>
          <Button asChild variant="accent" size="lg" className="mt-2 w-full">
            <NextLink href="/readingquestion" onClick={() => setOpen(false)} className="no-underline">
              Start practicing
              <ArrowRight className="h-4 w-4" />
            </NextLink>
          </Button>
        </SheetContent>
      </Sheet>
    </header>
  );
}
