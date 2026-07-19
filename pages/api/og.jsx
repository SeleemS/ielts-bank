import { ImageResponse } from '@vercel/og';

// Edge runtime is required by @vercel/og (Satori) for on-the-fly image rendering.
export const config = { runtime: 'edge' };

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------
const NAVY = '#0A2540'; // deep navy background
const NAVY_DEEP = '#071B2E'; // slightly darker for the vignette base
const EMERALD = '#059669'; // brand accent
const EMERALD_LIGHT = '#34D399'; // brighter emerald for glow / highlights
const WHITE = '#FFFFFF';
const SLATE = '#94A6BC'; // muted footer / wordmark tail

const DEFAULT_TITLE = 'Master IELTS with real, auto-scored practice';

// type -> human label shown in the emerald pill.
const TYPE_LABELS = {
  reading: 'Reading Practice',
  writing: 'Writing Practice',
  listening: 'Listening Practice',
  speaking: 'Speaking Practice',
  mock: 'IELTS Mock Test',
  blog: 'IELTS Blog',
  pricing: 'IELTS Premium',
  examiner: 'Speaking Examiner',
  calculator: 'Band Calculator',
  about: 'About IELTS-Bank',
  contact: 'Contact IELTS-Bank',
  home: 'Free IELTS Practice',
  default: 'IELTS Practice',
};

// Keep incoming user text sane: coerce to string, strip control chars, clamp
// length so a hostile / absurd query param can never blow up rendering.
function clean(value, max) {
  if (value == null) return '';
  let s = String(value);
  // Strip control characters (keep normal printable + accented text).
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

// Fetch Inter (bold + regular) at runtime. Satori supports ttf/otf/woff (not
// woff2), so we pull the woff builds fontsource ships. Any failure resolves to
// null and we fall back to @vercel/og's bundled default font — never throws.
async function loadFont(url) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const title = clean(searchParams.get('title'), 120) || DEFAULT_TITLE;
  const rawType = clean(searchParams.get('type'), 20).toLowerCase();
  const type = TYPE_LABELS[rawType] ? rawType : 'default';
  const subtitle = clean(searchParams.get('subtitle'), 40);
  const pill = TYPE_LABELS[type].toUpperCase();

  const [interBold, interRegular] = await Promise.all([
    loadFont(
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files/inter-latin-700-normal.woff'
    ),
    loadFont(
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files/inter-latin-400-normal.woff'
    ),
  ]);

  const fonts = [];
  if (interRegular) fonts.push({ name: 'Inter', data: interRegular, weight: 400, style: 'normal' });
  if (interBold) fonts.push({ name: 'Inter', data: interBold, weight: 700, style: 'normal' });
  const fontFamily = fonts.length ? 'Inter' : undefined;

  // Scale the title down a touch when it is long so wrapping stays graceful.
  const titleSize = title.length > 72 ? 58 : title.length > 44 ? 68 : 78;

  const image = (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: NAVY,
        backgroundImage: `radial-gradient(900px circle at 88% 8%, ${EMERALD}55, transparent 42%), radial-gradient(700px circle at 6% 100%, ${EMERALD_LIGHT}22, transparent 40%), linear-gradient(140deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        padding: '64px 72px',
        fontFamily,
        color: WHITE,
      }}
    >
      {/* Decorative emerald accent bar down the left edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 14,
          backgroundImage: `linear-gradient(180deg, ${EMERALD_LIGHT}, ${EMERALD})`,
        }}
      />

      {/* Header: wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: EMERALD,
            color: WHITE,
            fontSize: 30,
            fontWeight: 700,
            marginRight: 18,
          }}
        >
          IB
        </div>
        <span style={{ color: WHITE }}>IELTS</span>
        <span style={{ color: EMERALD_LIGHT }}>-Bank</span>
      </div>

      {/* Middle: pill + title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: EMERALD,
              color: WHITE,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {pill}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: 16,
                border: `2px solid ${EMERALD_LIGHT}88`,
                color: EMERALD_LIGHT,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 1,
                padding: '8px 20px',
                borderRadius: 999,
              }}
            >
              {subtitle.toUpperCase()}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 34,
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: WHITE,
            // Satori line-clamp: cap at 3 lines with an ellipsis.
            lineClamp: 3,
          }}
        >
          {title}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: 26,
          color: SLATE,
          fontWeight: 400,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: EMERALD_LIGHT, marginRight: 14 }} />
        Free IELTS practice · ielts-bank.com
      </div>
    </div>
  );

  return new ImageResponse(image, {
    width: 1200,
    height: 630,
    ...(fonts.length ? { fonts } : {}),
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, immutable, no-transform, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
    },
  });
}
