// /sitemap-blog.xml — child of the /sitemap.xml index (see pages/sitemap.xml.js).
import { renderSitemapSection } from './sitemap.xml';

export async function getServerSideProps({ res }) {
  return renderSitemapSection('blog', res);
}

export default function SitemapBlog() {
  return null;
}
