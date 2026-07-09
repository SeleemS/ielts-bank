import React, { useState } from 'react';
import { cn } from '../lib/utils';

// Pure Tailwind/shadcn segmented control. NO Chakra imports.
//
// Reading / Writing / Listening switcher. Uncontrolled by default (tracks its
// own selection) but calls onChange with the selected option string. Pass a
// `value` prop to drive it in controlled mode.

const OPTIONS = ['Reading', 'Writing', 'Listening'];

const Toggle = ({ value, defaultValue = 'Reading', onChange, className }) => {
  const [internal, setInternal] = useState(defaultValue);
  const selected = value != null ? value : internal;

  const handleSelect = (option) => {
    if (value == null) setInternal(option);
    if (onChange) onChange(option);
  };

  return (
    <div
      role="tablist"
      aria-label="Choose a skill"
      className={cn(
        'tw-root inline-flex w-full max-w-md items-center gap-1 rounded-lg border border-border bg-muted p-1 font-sans',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const isActive = selected === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelect(option)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};

export default Toggle;
