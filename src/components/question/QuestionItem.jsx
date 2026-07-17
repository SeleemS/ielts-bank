import React from 'react';
import { cn } from '../../lib/utils';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Checkbox } from '../../../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
import { typeConfig, booleanChoices, stripOptionKeyPrefix } from './grade';
import { sanitizeHtml } from '../../../lib/sanitize';

// Renders ONE question of any type, in both the active (answering) and review
// (post-submit) states. The `number` is the continuous global number used as
// the single key for value/onChange/grading.

function NumberBadge({ n, state }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        state === 'correct' && 'bg-accent text-accent-foreground',
        state === 'incorrect' && 'bg-destructive text-destructive-foreground',
        state === 'idle' && 'bg-secondary text-secondary-foreground'
      )}
    >
      {n}
    </span>
  );
}

function OptionRow({ children, tone }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 text-sm transition-colors',
        tone === 'correct' && 'border-accent bg-accent/10',
        tone === 'wrong' && 'border-destructive bg-destructive/10',
        tone === 'plain' && 'border-input'
      )}
    >
      {children}
    </div>
  );
}

export default function QuestionItem({
  group,
  question,
  value,
  onChange,
  submitted,
  result,
  flagged = false,
  onToggleFlag,
}) {
  const cfg = typeConfig(group.questionType);
  const n = question.number;
  const disabled = submitted;
  const state = submitted ? (result?.correct ? 'correct' : 'incorrect') : 'idle';

  const containerTone = !submitted
    ? 'border-border bg-card'
    : result?.correct
    ? 'border-accent/50 bg-accent/5'
    : 'border-destructive/50 bg-destructive/5';

  // ---- input renderers ----------------------------------------------------
  function renderRadio() {
    // multiple_choice: options come from group_options
    if (submitted) {
      return (
        <div className="grid gap-2">
          {group.options.map((opt) => {
            const isCorrect = (question.answerKey.correctOptionKeys || []).includes(opt.key);
            const isChosen = value === opt.key;
            const tone = isCorrect ? 'correct' : isChosen ? 'wrong' : 'plain';
            return (
              <OptionRow key={opt.key} tone={tone}>
                <span className="font-semibold text-foreground">{opt.key}.</span>
                <span className="text-foreground">{stripOptionKeyPrefix(opt.key, opt.text)}</span>
                {isCorrect && (
                  <span className="ml-auto text-xs font-semibold text-accent">Correct</span>
                )}
                {isChosen && !isCorrect && (
                  <span className="ml-auto text-xs font-semibold text-destructive">Your answer</span>
                )}
              </OptionRow>
            );
          })}
        </div>
      );
    }
    return (
      <RadioGroup value={value || ''} onValueChange={(v) => onChange(n, v)}>
        {group.options.map((opt) => (
          <label
            key={opt.key}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors',
              value === opt.key ? 'border-accent bg-accent/5' : 'border-input hover:bg-secondary'
            )}
          >
            <RadioGroupItem value={opt.key} className="mt-0.5" />
            <span className="text-foreground">
              <span className="font-semibold">{opt.key}.</span>{' '}
              {stripOptionKeyPrefix(opt.key, opt.text)}
            </span>
          </label>
        ))}
      </RadioGroup>
    );
  }

  function renderCheckbox() {
    // multiple_choice_multi: value is an array of keys
    const selected = Array.isArray(value) ? value : [];
    const toggle = (key) => {
      const next = selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key];
      onChange(n, next);
    };
    return (
      <div className="grid gap-2">
        {group.options.map((opt) => {
          const isCorrect = (question.answerKey.correctOptionKeys || []).includes(opt.key);
          const isChosen = selected.includes(opt.key);
          const tone = !submitted
            ? isChosen
              ? 'correct'
              : 'plain'
            : isCorrect
            ? 'correct'
            : isChosen
            ? 'wrong'
            : 'plain';
          return (
            <label
              key={opt.key}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors',
                tone === 'correct' && 'border-accent bg-accent/10',
                tone === 'wrong' && 'border-destructive bg-destructive/10',
                tone === 'plain' && 'border-input hover:bg-secondary',
                submitted && 'cursor-default'
              )}
            >
              <Checkbox
                checked={isChosen}
                onCheckedChange={() => toggle(opt.key)}
                disabled={disabled}
                className="mt-0.5"
              />
              <span className="text-foreground">
                <span className="font-semibold">{opt.key}.</span>{' '}
                {stripOptionKeyPrefix(opt.key, opt.text)}
              </span>
              {submitted && isCorrect && (
                <span className="ml-auto text-xs font-semibold text-accent">Correct</span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  function renderBoolean() {
    const choices = booleanChoices(group.questionType);
    return (
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const isChosen = (value || '').toLowerCase() === c.value;
          const isCorrect =
            submitted &&
            (question.answerKey.accepted || [])
              .map((a) => String(a).toLowerCase().trim())
              .includes(c.value);
          const tone = !submitted
            ? isChosen
              ? 'sel'
              : 'plain'
            : isCorrect
            ? 'correct'
            : isChosen
            ? 'wrong'
            : 'plain';
          return (
            <button
              key={c.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n, c.value)}
              aria-pressed={isChosen}
              className={cn(
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                tone === 'sel' && 'border-accent bg-accent/10 text-foreground',
                tone === 'correct' && 'border-accent bg-accent/15 text-foreground',
                tone === 'wrong' && 'border-destructive bg-destructive/10 text-foreground',
                tone === 'plain' && 'border-input text-foreground hover:bg-secondary',
                disabled && 'cursor-default'
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderSelect() {
    // matching_* : one select per question drawing from the shared option list
    return (
      <Select
        aria-label={question.promptText || `Question ${n}`}
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(n, e.target.value)}
        className={cn(
          submitted && result?.correct && 'border-accent',
          submitted && !result?.correct && 'border-destructive'
        )}
      >
        <option value="" disabled>
          Select…
        </option>
        {group.options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.key}. {stripOptionKeyPrefix(opt.key, opt.text)}
          </option>
        ))}
      </Select>
    );
  }

  function renderText() {
    return (
      <Input
        aria-label={question.promptText || `Question ${n}`}
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(n, e.target.value)}
        placeholder="Type your answer…"
        className={cn(
          submitted && result?.correct && 'border-accent',
          submitted && !result?.correct && 'border-destructive'
        )}
      />
    );
  }

  function renderInput() {
    switch (cfg.input) {
      case 'radio':
        return renderRadio();
      case 'checkbox':
        return renderCheckbox();
      case 'boolean':
        return renderBoolean();
      case 'select':
        return renderSelect();
      case 'visual': // image-dependent types degrade to a labelled text input
      case 'text':
      default:
        return renderText();
    }
  }

  const showStem = cfg.input !== 'radio' && cfg.input !== 'checkbox' ? true : true;
  const wordLimit = question.answerKey?.wordLimit;

  return (
    <div id={`question-${n}`} className={cn('scroll-mt-40 rounded-lg border p-4', containerTone)}>
      <div className="mb-3 flex items-start gap-2.5">
        <NumberBadge n={n} state={state} />
        <div className="flex-1 text-sm font-medium leading-relaxed text-foreground">
          {question.promptText ? (
            <span>{question.promptText}</span>
          ) : (
            <span className="text-muted-foreground">Gap {n}</span>
          )}
          {wordLimit ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (max {wordLimit} word{wordLimit > 1 ? 's' : ''})
            </span>
          ) : null}
        </div>
        {!submitted && (
          <button
            type="button"
            aria-pressed={flagged}
            onClick={() => onToggleFlag?.(n)}
            className={cn(
              'shrink-0 rounded-md border px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              flagged
                ? 'border-amber-500 bg-amber-100 text-amber-900'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            {flagged ? 'Flagged' : 'Flag'}
          </button>
        )}
      </div>

      {showStem && renderInput()}

      {submitted && !result?.correct && (
        <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm">
          <div>
            <span className="font-semibold text-destructive">Correct answer: </span>
            <span className="text-foreground">{result?.correctDisplay || '—'}</span>
          </div>
          {result?.answered && (
            <div className="mt-0.5 text-muted-foreground">
              Your answer: {result?.userDisplay || '—'}
              {result?.overLimit ? ' (over the word limit)' : ''}
            </div>
          )}
          {!result?.answered && (
            <div className="mt-0.5 text-muted-foreground">You left this blank.</div>
          )}
        </div>
      )}

      {submitted && question.answerKey?.explanation && (
        <div className="mt-3 rounded-md border border-accent/25 bg-accent/5 px-3 py-2 text-sm">
          <span className="font-semibold text-accent">Why: </span>
          <span
            className="text-foreground"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(question.answerKey.explanation),
            }}
          />
        </div>
      )}
    </div>
  );
}
