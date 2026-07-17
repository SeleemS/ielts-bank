import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeSvg } from './sanitize';

describe('sanitization', () => {
  it('removes active HTML while retaining normal content', () => {
    const clean = sanitizeHtml('<p onclick="steal()">Safe</p><script>alert(1)</script>');
    expect(clean).toContain('<p>Safe</p>');
    expect(clean).not.toMatch(/onclick|script|alert/);
  });

  it('retains safe SVG and removes foreignObject/event handlers', () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10" onload="bad()"><title>Chart</title><rect width="10" height="10"/><foreignObject>bad</foreignObject></svg>');
    expect(clean).toContain('<svg');
    expect(clean).toContain('<rect');
    expect(clean).not.toMatch(/onload|foreignObject/);
  });
});
