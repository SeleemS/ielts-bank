// /sitemap-guides.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('guides', res);
}

export default function SitemapGuides() {
  return null;
}
