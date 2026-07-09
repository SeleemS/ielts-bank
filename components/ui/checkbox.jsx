import * as React from 'react';
import { cn } from '../../src/lib/utils';

// Native checkbox tinted with the emerald accent. Controlled via
// checked / onCheckedChange to mirror the shadcn API.
const Checkbox = React.forwardRef(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border border-input accent-emerald-600',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      style={{ accentColor: 'hsl(var(--accent))' }}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
