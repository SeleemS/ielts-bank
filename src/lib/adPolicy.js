// Practice pages stay ad-free, but their public answer-key pages
// (/readingquestion/<slug>/answers, /listeningquestion/<slug>/answers) are
// editorial reference content like the blog, so ads are allowed there.
const AD_FREE_ROUTE =
  /^\/(?:dashboard|auth|band-estimator|ielts-writing-checker|pricing|billing(?:\/|$)|mock(?:\/|$)|r(?:\/|$|\?)|review(?:\/|$|\?)|(?:writing|speaking)question\/|(?:reading|listening)question\/(?![^/?#]+\/answers\/?(?:[?#]|$)))/;

export function adsAllowedForPath(asPath = '') {
  return !AD_FREE_ROUTE.test(String(asPath));
}

export function adsAllowedForConsent(optionalConsent) {
  return optionalConsent === 'granted';
}
