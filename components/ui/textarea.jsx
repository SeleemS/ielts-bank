import * as React from 'react';
import { cn } from '../../src/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      // text-base below sm: font sizes under 16px make iOS Safari zoom the
      // page whenever the field is focused.
      'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm transition-colors sm:text-sm',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
