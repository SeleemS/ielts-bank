// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListeningIntroModal from './ListeningIntroModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let opener;
let onClose;

function renderModal(open = true) {
  act(() => {
    root.render(<ListeningIntroModal open={open} onClose={onClose} />);
  });
}

beforeEach(() => {
  opener = document.createElement('button');
  opener.textContent = 'Open Listening help';
  document.body.appendChild(opener);
  opener.focus();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onClose = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  opener.remove();
});

describe('ListeningIntroModal keyboard behavior', () => {
  it('focuses the close action and wraps Tab in both directions', () => {
    renderModal();

    const closeButton = container.querySelector('button[aria-label="Close"]');
    const startButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Got it — start practising'
    );
    expect(document.activeElement).toBe(closeButton);

    startButton.focus();
    const forward = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(startButton);
  });

  it('closes on Escape and restores the opener when removed', () => {
    renderModal();

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: false });

    renderModal(false);
    expect(document.activeElement).toBe(opener);
  });

  it('returns the current preference after checkbox state changes', () => {
    renderModal();

    const checkbox = container.querySelector('input[type="checkbox"]');
    act(() => {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(onClose).toHaveBeenCalledWith({ dontShowAgain: true });
  });
});
