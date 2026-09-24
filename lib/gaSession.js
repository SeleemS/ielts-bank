// GA session IDs are positive integer timestamps in seconds, not app UUIDs.
export function sanitizeGaSessionId(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const text = String(value);
  if (!/^[1-9]\d{0,15}$/.test(text)) return null;
  return Number.isSafeInteger(Number(text)) ? text : null;
}

export function attributableGaSessionId(value, now = Date.now()) {
  const id = sanitizeGaSessionId(value);
  if (!id) return null;
  const age = now / 1000 - Number(id);
  return age >= 0 && age <= 24 * 60 * 60 ? id : null;
}
