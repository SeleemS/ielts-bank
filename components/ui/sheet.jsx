import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../src/lib/utils';

/*
 * Lightweight Sheet (slide-over) primitive in the shadcn visual language,
 * implemented without @radix-ui/react-dialog to avoid an extra dependency
 * during the migration. Controlled via `open` / `onOpenChange`.
 */

function Sheet({ open, onOpenChange, children }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000]">{children}</div>,
    document.body
  );
}

function SheetOverlay({ onClose }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
    />
  );
}

const sideClasses = {
  right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r',
};

const SheetContent = React.forwardRef(
  ({ className, children, side = 'right', onClose, showClose = true, ...props }, ref) => (
    <>
      <SheetOverlay onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed z-[2001] flex flex-col gap-6 overflow-y-auto bg-background p-6 shadow-2xl border-border pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          'animate-in slide-in-from-right duration-300',
          sideClasses[side],
          className
        )}
        {...props}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {children}
      </div>
    </>
  )
);
SheetContent.displayName = 'SheetContent';

function SheetHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-2 text-left', className)} {...props} />;
}

function SheetTitle({ className, ...props }) {
  return <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}

export { Sheet, SheetContent, SheetHeader, SheetTitle };
