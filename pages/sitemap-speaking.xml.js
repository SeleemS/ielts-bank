// /sitemap-speaking.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('speaking', res);
}

export default function SitemapSpeaking() {
  return null;
}
