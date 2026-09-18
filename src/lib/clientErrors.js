// src/lib/clientErrors.js
// Two jobs, both invisible when nothing is wrong:
//
// 1. RECOVER — after a deploy, a tab opened on the previous build requests
//    hashed chunk files that no longer exist on its next SPA navigation
//    (ChunkLoadError). Next.js has no built-in recovery: the visitor lands on
//    the "Application error: a client-side exception has occurred" screen.
//    We detect the stale-chunk signature and hard-navigate once, which loads
//    the current deployment; a per-URL sessionStorage guard prevents reload
//    loops when the failure is anything other than staleness.
//
// 2. REPORT — surviving unhandled exceptions send a rate-limited
//    `client_error` event through track() (consent-gated like every other
//    event), so real user-facing crashes are visible in activity_events with
//    a message and path instead of only as mystery "Application error" page
//    titles in GA.

const RELOADED_KEY = 'ib_chunk_reload';
// Opaque rejections must not exhaust the budget for actionable exceptions.
const MAX_ACTIONABLE_REPORTS = 3;
const MAX_OPAQUE_REPORTS = 2;
let actionableReports = 0;
let opaqueReports = 0;
let analyticsModule;
const reportedSignatures = new Set();
const ERROR_TYPES = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'DOMException']);
const HANDLERS = new Set(['routeChangeError', 'window.onerror', 'unhandledrejection']);
const PAGE_GROUPS = new Set(['pricing', 'ielts-writing-checker', 'band-estimator', 'writingquestion', 'speakingquestion', 'readingquestion', 'listeningquestion', 'mock', 'mock-test', 'auth', 'account', 'dashboard', 'blog']);

const CHUNK_RE =
  /ChunkLoadError|Loading chunk [^ ]* ?failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleChunkError(error) {
  if (!error) return false;
  try {
    if (typeof error === 'string') return CHUNK_RE.test(error);
    return CHUNK_RE.test(`${error.name || ''} ${error.message || ''}`);
  } catch {
    return false;
  }
}

function alreadyReloadedFor(url) {
  try {
    return window.sessionStorage.getItem(RELOADED_KEY) === url;
  } catch {
    // Storage unavailable: we cannot guard against a loop, so don't reload.
    return true;
  }
}

function markReloadedFor(url) {
  try {
    window.sessionStorage.setItem(RELOADED_KEY, url);
  } catch {
    /* best effort */
  }
}

// Hard-navigate to the target (or current) URL so the browser fetches the
// live build. Returns whether a reload was actually issued.
export function recoverFromStaleChunk(targetUrl) {
  const url = targetUrl || window.location.href;
  if (alreadyReloadedFor(url)) return false;
  markReloadedFor(url);
  window.location.assign(url);
  return true;
}

// Only a same-origin generated static asset is diagnostic filename evidence.
// Never report arbitrary resource URLs, query strings, stacks or error text.
function safeFilename(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.username || url.password) return null;
    return /^\/_next\/static\/(?:chunks|css)\/[a-zA-Z0-9_/[\].-]+\.(?:js|css)$/.test(url.pathname)
      && url.pathname.length <= 180 ? url.pathname : null;
  } catch {
    return null;
  }
}

function positiveLocation(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 10000000 ? value : null;
}

export function reportClientError(reason, source, location = {}) {
  try {
    const errorType = reason && typeof reason === 'object' && ERROR_TYPES.has(reason.name)
      ? reason.name : null;
    const classification = reason === undefined ? 'missing_reason'
      : reason === null ? 'null_reason'
        : errorType ? 'error_object'
          : reason === 'Script error.' ? 'opaque_script_error'
            : typeof reason === 'string' ? 'string_reason' : 'non_error_reason';
    const filename = safeFilename(location.filename);
    const actionable = Boolean(errorType || filename);
    const pageGroup = window.location.pathname.split('/')[1];
    const build = window.__NEXT_DATA__?.buildId;
    const payload = {
      message: classification,
      source: HANDLERS.has(source) ? source : 'unknown_handler',
      error_type: errorType,
      diagnostic_version: 'client_error_v2',
      build_id: typeof build === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(build) ? build : null,
      filename,
      line: filename ? positiveLocation(location.line) : null,
      column: filename ? positiveLocation(location.column) : null,
      // Retain a bounded page family, never a learner-controlled path segment.
      path: !pageGroup ? '/' : PAGE_GROUPS.has(pageGroup) ? `/${pageGroup}` : '/other',
    };
    const signature = JSON.stringify(payload);
    if (reportedSignatures.has(signature)) return;
    if (actionable ? actionableReports >= MAX_ACTIONABLE_REPORTS : opaqueReports >= MAX_OPAQUE_REPORTS) return;
    reportedSignatures.add(signature);
    if (actionable) actionableReports += 1;
    else opaqueReports += 1;
    // Keep the existing consent-gated transport; importing it cannot crash UI.
    analyticsModule ||= import('./analytics');
    analyticsModule.then(({ track }) => track('client_error', payload)).catch(() => {});
  } catch {
    // Even hostile rejection objects/getters must not break the error handler.
  }
}

// Installs the route-error recovery plus window-level reporting. Returns a
// cleanup function (used by the _app effect).
export function installClientErrorHandlers(router) {
  const onRouteError = (error, url) => {
    if (error?.cancelled) return;
    if (isStaleChunkError(error) && recoverFromStaleChunk(url)) return;
    reportClientError(error, 'routeChangeError');
  };
  const onWindowError = (event) => {
    const error = event?.error || { message: event?.message };
    if (isStaleChunkError(error)) {
      recoverFromStaleChunk();
      return;
    }
    reportClientError(event?.error ?? event?.message, 'window.onerror', {
      filename: event?.filename, line: event?.lineno, column: event?.colno,
    });
  };
  const onRejection = (event) => {
    const reason = event?.reason;
    if (isStaleChunkError(reason)) {
      recoverFromStaleChunk();
      return;
    }
    reportClientError(reason, 'unhandledrejection');
  };

  router.events.on('routeChangeError', onRouteError);
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    router.events.off('routeChangeError', onRouteError);
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
