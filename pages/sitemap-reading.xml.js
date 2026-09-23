// /sitemap-reading.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { STATIC_ROUTES } from './sitemap.xml';
import { renderSitemapSection } from '../lib/sitemapData';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('reading', res, STATIC_ROUTES);
}

export default function SitemapReading() {
  return null;
}
