const AD_FREE_ROUTE =
  /^\/(?:dashboard|auth|band-estimator|ielts-writing-checker|pricing|billing(?:\/|$)|mock(?:\/|$)|(?:reading|writing|listening|speaking)question\/)/;

export function adsAllowedForPath(asPath = '') {
  return !AD_FREE_ROUTE.test(String(asPath));
}
