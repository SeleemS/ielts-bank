// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestionItem from './QuestionItem';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const group = {
  questionType: 'sentence_completion',
  options: [],
};
const question = {
  number: 3,
  promptText: 'A water clock was affected by cold ______.',
  answerKey: {
    accepted: ['weather'],
    wordLimit: 1,
  },
};

let container;
let root;
let onToggleFlag;

function renderQuestion({ flagged = false } = {}) {
  act(() => {
    root.render(
      <QuestionItem
        group={group}
        question={question}
        value=""
        onChange={vi.fn()}
        submitted={false}
        result={null}
        flagged={flagged}
        onToggleFlag={onToggleFlag}
      />
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onToggleFlag = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('QuestionItem flag control', () => {
  it('names the idle action with its question number', () => {
    renderQuestion();

    const button = container.querySelector('button[aria-pressed]');
    expect(button.getAttribute('aria-label')).toBe('Flag question 3');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onToggleFlag).toHaveBeenCalledWith(3);
  });

  it('names the selected action as unflagging the same question', () => {
    renderQuestion({ flagged: true });

    const button = container.querySelector('button[aria-pressed]');
    expect(button.getAttribute('aria-label')).toBe('Unflag question 3');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
