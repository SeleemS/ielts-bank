import Head from "next/head";
import NextLink from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "../../src/components/Navbar";
import Footer from "../../src/components/Footer";
import { posts } from "../../lib/posts";

const SITE_URL = "https://ielts-bank.com";

// Explicit "prose"-like typography via arbitrary child selectors. The
// @tailwindcss/typography plugin is intentionally NOT used; Tailwind Preflight
// is also off, so every element the CMS HTML can emit is styled here directly.
const PROSE = [
  "max-w-none text-base leading-8 text-slate-700",
  "[&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground",
  "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_p]:mb-5",
  "[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:mb-2 [&_li]:pl-1 [&_li]:marker:text-accent",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_em]:italic",
  "[&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent/80",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
].join(" ");

export default function BlogPost({ post }) {
  const canonical = `${SITE_URL}/blog/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: new Date(post.date).toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    author: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
    },
  };

  return (
    <>
      <Head>
        <title>{`${post.title} | IELTS-Bank`}</title>
        <meta name="description" content={post.excerpt} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />

        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <div className="tw-root flex min-h-screen flex-col bg-secondary/40">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 md:py-14 lg:px-8">
            <NextLink
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </NextLink>

            <article className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-10">
              <header className="mb-8 border-b border-border pb-8">
                <time className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {post.date}
                </time>
                <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {post.title}
                </h1>
              </header>

              <div
                className={PROSE}
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </article>

            <div className="mt-8 text-center">
              <NextLink
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all articles
              </NextLink>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = posts.find((p) => p.slug === params.slug) || null;

  if (!post) {
    return { notFound: true };
  }

  return { props: { post } };
}
