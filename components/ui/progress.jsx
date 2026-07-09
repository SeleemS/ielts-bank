import * as React from 'react';
import { cn } from '../../src/lib/utils';

function Progress({ value = 0, className, indicatorClassName }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className={cn('h-full rounded-full bg-accent transition-all duration-300', indicatorClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export { Progress };
