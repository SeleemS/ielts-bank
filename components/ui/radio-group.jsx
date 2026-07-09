import * as React from 'react';
import { cn } from '../../src/lib/utils';

// Dependency-free radio group built on native <input type="radio">. Controlled
// via value / onValueChange, mirroring the shadcn RadioGroup API.
const RadioGroupContext = React.createContext(null);

function RadioGroup({ value, onValueChange, name, className, children, ...props }) {
  const auto = React.useId();
  const groupName = name || `rg-${auto}`;
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange, name: groupName }}>
      <div role="radiogroup" className={cn('grid gap-2', className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

const RadioGroupItem = React.forwardRef(
  ({ value, id, className, disabled, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext);
    const checked = ctx?.value === value;
    return (
      <input
        ref={ref}
        id={id}
        type="radio"
        name={ctx?.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => ctx?.onValueChange?.(value)}
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer border border-input',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        style={{ accentColor: 'hsl(var(--accent))' }}
        {...props}
      />
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
