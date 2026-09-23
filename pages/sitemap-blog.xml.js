// /sitemap-blog.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { STATIC_ROUTES } from './sitemap.xml';
import { renderSitemapSection } from '../lib/sitemapData';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('blog', res, STATIC_ROUTES);
}

export default function SitemapBlog() {
  return null;
}
