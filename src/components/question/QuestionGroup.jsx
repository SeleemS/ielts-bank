import React from 'react';
import QuestionItem from './QuestionItem';
import { typeConfig } from './grade';

// Renders one question_group: heading + instructions (+ an options legend for
// matching types) followed by its questions.
// Strip any <script> tags before injecting a group's SVG illustration. The SVG
// is display-only (maps/plans for map-labelling questions); this keeps the
// dangerouslySetInnerHTML payload inert.
function sanitizeSvg(svg) {
  return String(svg).replace(/<script[\s\S]*?<\/script\s*>/gi, '');
}

export default function QuestionGroup({ group, answers, onChange, submitted, results }) {
  const cfg = typeConfig(group.questionType);
  const showLegend = cfg.input === 'select' && (group.options || []).length > 0;
  const imageLabel = /\bplan\b/i.test(group.prompt || '') ? 'Plan' : 'Map';

  const first = group.questions[0]?.number;
  const last = group.questions[group.questions.length - 1]?.number;
  const range =
    group.questions.length > 1 ? `Questions ${first}–${last}` : `Question ${first}`;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">{range}</div>
        {group.prompt ? (
          <h3 className="mt-1 text-base font-bold text-foreground">{group.prompt}</h3>
        ) : null}
      </div>

      {group.instructionsHtml ? (
        <div
          className="mb-4 rounded-md border border-border bg-secondary/50 p-3 text-sm leading-relaxed text-foreground [&_p]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2"
          dangerouslySetInnerHTML={{ __html: group.instructionsHtml }}
        />
      ) : null}

      {group.imageSvg ? (
        <figure className="mb-4 overflow-x-auto rounded-md border border-border bg-card p-3">
          <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {imageLabel}
          </figcaption>
          <div
            className="[&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: sanitizeSvg(group.imageSvg) }}
          />
        </figure>
      ) : null}

      {showLegend ? (
        <div className="mb-4 rounded-md border border-border bg-card p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </div>
          <ul className="grid gap-1 text-sm text-foreground">
            {group.options.map((opt) => (
              <li key={opt.key}>
                <span className="font-semibold">{opt.key}.</span> {opt.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3">
        {group.questions.map((question) => (
          <QuestionItem
            key={question.number}
            group={group}
            question={question}
            value={answers[question.number]}
            onChange={onChange}
            submitted={submitted}
            result={results ? results.byNumber[question.number] : null}
          />
        ))}
      </div>
    </section>
  );
}
