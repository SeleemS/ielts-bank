// /sitemap-writing.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('writing', res);
}

export default function SitemapWriting() {
  return null;
}
