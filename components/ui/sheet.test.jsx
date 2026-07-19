// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Sheet, SheetContent, SheetTitle } from './sheet';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function Harness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open menu
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent onClose={() => setOpen(false)}>
          <SheetTitle>Navigation</SheetTitle>
          <a href="/practice">Practice</a>
        </SheetContent>
      </Sheet>
    </>
  );
}

function clickOpen() {
  const trigger = container.querySelector('button');
  trigger.focus();
  act(() => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Sheet keyboard behavior', () => {
  it('moves focus inside, closes with Escape, and restores the trigger', () => {
    clickOpen();

    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Open menu');
  });
});
