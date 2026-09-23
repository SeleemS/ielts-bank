// /sitemap-reading.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('reading', res);
}

export default function SitemapReading() {
  return null;
}
