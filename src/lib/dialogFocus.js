import * as React from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hidden || element.tabIndex < 0) return false;
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = window.getComputedStyle?.(element);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  });
}

export function useDialogFocus({
  active,
  containerRef,
  onDismiss,
  focusKey = 'default',
}) {
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  React.useEffect(() => {
    if (!active || !containerRef.current) return undefined;
    const container = containerRef.current;
    const previousFocus = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!container.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, [active, containerRef]);

  React.useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const preferred = container.querySelector('[data-dialog-initial-focus]');
    const target = preferred || focusableElements(container)[0] || container;
    target.focus();
  }, [active, containerRef, focusKey]);
}
