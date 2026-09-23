// /sitemap-guides.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { STATIC_ROUTES } from './sitemap.xml';
import { renderSitemapSection } from '../lib/sitemapData';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('guides', res, STATIC_ROUTES);
}

export default function SitemapGuides() {
  return null;
}
