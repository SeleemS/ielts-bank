// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useDialogFocus } from './dialogFocus';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function Harness() {
  const [open, setOpen] = React.useState(false);
  const dialogRef = React.useRef(null);
  useDialogFocus({
    active: open,
    containerRef: dialogRef,
    onDismiss: () => setOpen(false),
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <button type="button" data-dialog-initial-focus>
            First action
          </button>
          <button type="button">Last action</button>
        </div>
      )}
    </>
  );
}

function click(label) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === label
  );
  expect(button).toBeTruthy();
  button.focus();
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function press(key, shiftKey = false) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
    );
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

describe('useDialogFocus', () => {
  it('moves focus into the dialog when it opens', () => {
    click('Open dialog');

    expect(document.activeElement?.textContent).toBe('First action');
    expect(container.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  });

  it('wraps forward and reverse tab navigation inside the dialog', () => {
    click('Open dialog');
    const first = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'First action'
    );
    const last = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Last action'
    );

    last.focus();
    press('Tab');
    expect(document.activeElement).toBe(first);

    press('Tab', true);
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape and restores the trigger focus', () => {
    click('Open dialog');
    press('Escape');

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Open dialog');
  });
});
