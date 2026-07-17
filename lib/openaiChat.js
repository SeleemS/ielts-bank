// lib/openaiChat.js
// Server-side OpenAI chat-completions call shared by the writing and speaking
// scoring routes.
//
// Adds one piece of resilience: if the configured model is rejected with
// `model_not_found` — which happens when OPENAI_API_KEY is a project-scoped
// key whose OpenAI project doesn't allowlist that model — we retry once with
// the fallback model instead of failing the user's submission with a 502.
// (Long-term fix: enable the model for the project in the OpenAI dashboard,
// or point SCORING_MODEL_FREE / SCORING_MODEL_PAID at an allowed model.)

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function call(model, { messages, responseFormat, signal }) {
  return fetch(OPENAI_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: responseFormat,
    }),
  });
}

function isModelNotFound(status, detail) {
  return (
    (status === 403 || status === 404) &&
    (detail.includes('model_not_found') || detail.includes('does not have access to model'))
  );
}

// Returns { ok, status, model, payload, detail }:
//   ok      - whether the (possibly retried) call succeeded
//   model   - the model that actually produced the result (record this)
//   payload - parsed JSON body on success
//   detail  - error body text on failure (already consumed from the response)
export async function chatCompletionWithFallback({
  model,
  fallbackModel,
  messages,
  responseFormat,
  signal,
}) {
  let used = model;
  let response = await call(model, { messages, responseFormat, signal });

  if (!response.ok && fallbackModel && fallbackModel !== model) {
    const detail = await response.text().catch(() => '');
    if (!isModelNotFound(response.status, detail)) {
      return { ok: false, status: response.status, model: used, payload: null, detail };
    }
    console.error(
      `OpenAI rejected model "${model}" for this API key (${response.status} model_not_found); ` +
        `retrying with "${fallbackModel}". Enable the model for the OpenAI project or set SCORING_MODEL_FREE/PAID.`
    );
    used = fallbackModel;
    response = await call(fallbackModel, { messages, responseFormat, signal });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, status: response.status, model: used, payload: null, detail };
  }
  const payload = await response.json().catch(() => null);
  return { ok: true, status: response.status, model: used, payload, detail: '' };
}
