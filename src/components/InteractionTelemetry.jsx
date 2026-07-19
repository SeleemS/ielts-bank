import * as React from 'react';
import { ensureGoogleAnalytics, track } from '../lib/analytics';
import { useAuth } from '../lib/auth';

const CLICKABLE_SELECTOR = [
  '[data-analytics-id]',
  'button',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
].join(',');
const CONTROL_SELECTOR = 'input, select, textarea';
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [data-analytics-popup]';
const MAX_LABEL_LENGTH = 120;

function compact(value, max = MAX_LABEL_LENGTH) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeLabel(value) {
  const label = compact(value);
  if (!label || /\S+@\S+\.\S+/.test(label)) return '';
  return label;
}

function slugify(value) {
  return compact(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function labelledByText(element) {
  const id = element?.getAttribute?.('aria-labelledby');
  if (!id || typeof document === 'undefined') return '';
  return id
    .split(/\s+/)
    .map((item) => document.getElementById(item)?.textContent || '')
    .join(' ');
}

function associatedLabel(element) {
  if (!element) return '';
  if (element.labels?.length) return Array.from(element.labels).map((label) => label.textContent || '').join(' ');
  return element.closest?.('label')?.textContent || '';
}

function elementLabel(element) {
  return safeLabel(
    element?.dataset?.analyticsLabel ||
      element?.getAttribute?.('aria-label') ||
      labelledByText(element) ||
      associatedLabel(element) ||
      element?.textContent ||
      element?.getAttribute?.('title') ||
      element?.getAttribute?.('name') ||
      element?.getAttribute?.('type')
  );
}

function elementId(element, label = '') {
  return compact(
    element?.dataset?.analyticsId ||
      element?.id ||
      element?.getAttribute?.('name') ||
      element?.getAttribute?.('href') ||
      slugify(label) ||
      element?.tagName?.toLowerCase(),
    100
  );
}

function controlType(element) {
  return compact(
    element?.getAttribute?.('role') ||
      element?.getAttribute?.('type') ||
      element?.tagName?.toLowerCase(),
    40
  ).toLowerCase();
}

function formId(element) {
  const form = element?.tagName === 'FORM' ? element : element?.closest?.('form');
  if (!form) return '';
  const submit = form.querySelector?.('button[type="submit"], input[type="submit"], button:not([type])');
  return elementId(form, elementLabel(submit)) || 'form';
}

function destination(element) {
  const href = element?.closest?.('a[href]')?.getAttribute('href');
  if (!href) return '';
  try {
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.hash || ''}`.slice(0, 200)
      : url.hostname.slice(0, 200);
  } catch {
    return compact(href, 200);
  }
}

function contextFor(element, signedIn) {
  const surfaceNode = element?.closest?.('[data-analytics-surface]');
  const skillNode = element?.closest?.('[data-analytics-skill]');
  const slugNode = element?.closest?.('[data-analytics-slug]');
  const questionNode = element?.closest?.('[data-analytics-question-number]');
  const dialog = element?.closest?.(DIALOG_SELECTOR);
  return {
    signed_in: signedIn,
    surface:
      surfaceNode?.dataset?.analyticsSurface ||
      (dialog ? 'modal' : window.location.pathname.split('/').filter(Boolean)[0] || 'home'),
    skill: skillNode?.dataset?.analyticsSkill || undefined,
    slug: slugNode?.dataset?.analyticsSlug || undefined,
    question_number: questionNode?.dataset?.analyticsQuestionNumber || undefined,
    question_type: questionNode?.dataset?.analyticsQuestionType || undefined,
  };
}

function dialogMetadata(dialog, signedIn) {
  const label = safeLabel(
    dialog?.dataset?.analyticsLabel ||
      labelledByText(dialog) ||
      dialog?.querySelector?.('h1, h2, h3, [role="heading"]')?.textContent ||
      dialog?.getAttribute?.('aria-label')
  );
  return {
    ...contextFor(dialog, signedIn),
    modal_id: elementId(dialog, label) || 'dialog',
    modal_label: label || undefined,
    modal_kind: dialog?.dataset?.analyticsPopup ? 'popup' : 'dialog',
  };
}

export function interactionEvent(element, signedIn, interaction = 'activate') {
  const question = element?.closest?.('[data-analytics-question-number]');
  if (question) {
    return {
      name: 'question_answer',
      params: {
        ...contextFor(element, signedIn),
        answer_action: interaction,
        control_type: controlType(element),
      },
    };
  }
  const label = elementLabel(element);
  return {
    name: 'ui_interaction',
    params: {
      ...contextFor(element, signedIn),
      interaction,
      element_id: elementId(element, label),
      element_label: label || undefined,
      element_type: controlType(element),
      form_id: formId(element) || undefined,
      destination: destination(element) || undefined,
      expanded:
        element?.getAttribute?.('aria-expanded') == null
          ? undefined
          : element.getAttribute('aria-expanded') === 'true',
      pressed:
        element?.getAttribute?.('aria-pressed') == null
          ? undefined
          : element.getAttribute('aria-pressed') === 'true',
    },
  };
}

export function fieldChangeEvent(element, signedIn) {
  const question = element?.closest?.('[data-analytics-question-number]');
  const type = controlType(element);
  const answered =
    type === 'checkbox' || type === 'radio'
      ? Boolean(element.checked)
      : Boolean(String(element.value || '').trim());
  if (question) {
    return {
      name: 'question_answer',
      params: {
        ...contextFor(element, signedIn),
        answer_action: 'change',
        control_type: type,
        answered,
        answer_length:
          type === 'text' || type === 'textarea' ? String(element.value || '').length : undefined,
      },
    };
  }
  const label = elementLabel(element);
  return {
    name: 'field_change',
    params: {
      ...contextFor(element, signedIn),
      element_id: elementId(element, label),
      element_label: label || undefined,
      control_type: type,
      form_id: formId(element) || undefined,
      has_value: answered,
      checked: type === 'checkbox' || type === 'radio' ? Boolean(element.checked) : undefined,
    },
  };
}

export default function InteractionTelemetry() {
  const { user } = useAuth();
  const signedInRef = React.useRef(Boolean(user?.id));
  signedInRef.current = Boolean(user?.id);

  React.useEffect(() => {
    const activeDialogs = new Map();
    ensureGoogleAnalytics();
    window.__ieltsInteractionTelemetry = 'installed';

    const onClick = (event) => {
      const element = event.target?.closest?.(CLICKABLE_SELECTOR);
      if (!element || element.disabled || element.dataset?.analyticsSkip === 'true') return;
      const item = interactionEvent(element, signedInRef.current);
      track(item.name, item.params);
    };

    const onChange = (event) => {
      const element = event.target?.closest?.(CONTROL_SELECTOR);
      if (
        !element ||
        element.disabled ||
        element.type === 'password' ||
        element.type === 'hidden' ||
        element.dataset?.analyticsSkip === 'true'
      ) return;
      const item = fieldChangeEvent(element, signedInRef.current);
      track(item.name, item.params);
    };

    const onSubmit = (event) => {
      const form = event.target;
      if (!form || form.dataset?.analyticsSkip === 'true') return;
      track('form_submit', {
        ...contextFor(form, signedInRef.current),
        form_id: formId(form) || 'form',
      });
    };

    const onPointerUp = (event) => {
      const slider = event.target?.closest?.('[role="slider"]');
      if (!slider || slider.dataset?.analyticsSkip === 'true') return;
      const item = interactionEvent(slider, signedInRef.current, 'adjust');
      track(item.name, item.params);
    };

    const scanDialogs = () => {
      const current = new Set(document.querySelectorAll(DIALOG_SELECTOR));
      for (const dialog of current) {
        if (activeDialogs.has(dialog)) continue;
        const metadata = dialogMetadata(dialog, signedInRef.current);
        activeDialogs.set(dialog, { metadata, openedAt: Date.now() });
        track('modal_open', metadata);
      }
      for (const [dialog, entry] of activeDialogs) {
        if (current.has(dialog)) continue;
        track('modal_close', {
          ...entry.metadata,
          open_duration_ms: Math.max(0, Date.now() - entry.openedAt),
        });
        activeDialogs.delete(dialog);
      }
    };

    const seenAlerts = new WeakSet();
    const scanAlerts = () => {
      for (const alert of document.querySelectorAll('[role="alert"]')) {
        if (seenAlerts.has(alert)) continue;
        const label = safeLabel(alert.textContent);
        if (!label) continue;
        seenAlerts.add(alert);
        track('ui_feedback', {
          ...contextFor(alert, signedInRef.current),
          feedback_type: 'alert',
          feedback_id: elementId(alert, label),
          feedback_label: label || undefined,
        });
      }
    };

    const observer = new MutationObserver(() => {
      scanDialogs();
      scanAlerts();
    });

    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('pointerup', onPointerUp);
    observer.observe(document.body, { childList: true, subtree: true });
    scanDialogs();
    scanAlerts();

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('pointerup', onPointerUp);
      observer.disconnect();
      delete window.__ieltsInteractionTelemetry;
    };
  }, []);

  return null;
}
