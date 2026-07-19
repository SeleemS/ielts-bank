// src/components/dashboard/States.js
// Presentational non-data states for the dashboard: loading spinner, the
// signed-out prompt, an empty ("not practised yet") state, and an error card.
// Kept dependency-light so pages/dashboard.js stays a thin orchestrator.

import * as React from 'react';
import NextLink from 'next/link';
import { Loader2, LineChart, BookOpen, PenLine, Headphones, Mic } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import SignInDialog from '../auth/SignInDialog';

// Centered spinner while auth (and then data) resolves.
export function LoadingState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
      <p className="text-sm">Loading your progress…</p>
    </div>
  );
}

export function SignedOutState() {
  const [signInOpen, setSignInOpen] = React.useState(false);
  return (
    <>
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
        <CardHeader>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <LineChart className="h-6 w-6" />
          </span>
          <CardTitle as="h1" className="mt-4 text-xl">Sign in to see your progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Track your band scores across Reading, Writing, Listening and Speaking, review recent
            attempts, and watch your trend improve over time.
          </p>
          <Button type="button" variant="accent" className="w-full" onClick={() => setSignInOpen(true)}>
            Sign in
          </Button>
          <Button asChild variant="outline" className="w-full">
            <NextLink href="/" className="no-underline">Back to home</NextLink>
          </Button>
        </CardContent>
        </Card>
      </div>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
}

const START_LINKS = [
  { label: 'Start a Reading test', href: '/readingquestion', icon: BookOpen },
  { label: 'Start a Writing test', href: '/writingquestion', icon: PenLine },
  { label: 'Start a Listening test', href: '/listeningquestion', icon: Headphones },
  { label: 'Start Speaking practice', href: '/speakingquestion', icon: Mic },
];

// Signed in, but no attempts/scores yet.
export function EmptyState() {
  return (
    <Card className="text-center">
      <CardHeader>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <LineChart className="h-6 w-6" />
        </span>
        <CardTitle className="mt-4 text-xl">You haven&apos;t practised yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Complete a practice test and your scores, bands and progress trend will show up here.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {START_LINKS.map(({ label, href, icon: Icon }) => (
            <Button key={href} asChild variant="accent">
              <NextLink href={href} className="no-underline">
                <Icon className="h-4 w-4" />
                {label}
              </NextLink>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Non-fatal fetch error.
export function ErrorState({ message }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="p-6 text-center">
        <p className="text-sm font-medium text-destructive">Couldn&apos;t load your progress</p>
        <p className="mt-1 text-sm text-muted-foreground">{message || 'Please try again in a moment.'}</p>
      </CardContent>
    </Card>
  );
}
