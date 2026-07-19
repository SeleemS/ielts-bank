// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExaminerIntroModal from './ExaminerIntroModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let opener;
let onClose;
let onStart;

function renderModal(open = true) {
  act(() => {
    root.render(
      <ExaminerIntroModal
        open={open}
        onClose={onClose}
        onStart={onStart}
      />
    );
  });
}

function press(key, shiftKey = false) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

beforeEach(() => {
  opener = document.createElement('button');
  opener.textContent = 'Choose full mock';
  document.body.appendChild(opener);
  opener.focus();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onClose = vi.fn();
  onStart = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  opener.remove();
});

describe('ExaminerIntroModal', () => {
  it('provides a close action and traps focus in both directions', () => {
    renderModal();

    const closeButton = container.querySelector('button[aria-label="Close"]');
    const startButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Start my interview'
    );
    expect(document.activeElement).toBe(closeButton);

    startButton.focus();
    press('Tab');
    expect(document.activeElement).toBe(closeButton);

    press('Tab', true);
    expect(document.activeElement).toBe(startButton);
  });

  it('dismisses on Escape without starting and restores the opener', () => {
    renderModal();
    press('Escape');

    expect(onClose).toHaveBeenCalledWith({
      dontShowAgain: false,
      start: false,
    });
    expect(onStart).not.toHaveBeenCalled();

    renderModal(false);
    expect(document.activeElement).toBe(opener);
  });

  it('starts exactly once with the current preference', () => {
    renderModal();

    const checkbox = container.querySelector('input[type="checkbox"]');
    const startButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Start my interview'
    );
    act(() => {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      startButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledWith({
      dontShowAgain: true,
      start: true,
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
      onStart.mock.invocationCallOrder[0]
    );
  });
});
