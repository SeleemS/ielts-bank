// /sitemap-listening.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('listening', res);
}

export default function SitemapListening() {
  return null;
}
