// Builds blogs/posts.json from blogs/<slug>/index.md folders.
// Run with: node scripts/build-blog.js
// Triggered automatically by .github/workflows/build-blog.yml on push.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { Marked } = require("marked");

const BLOGS_DIR = path.join(__dirname, "..", "blogs");
const OUTPUT_FILE = path.join(BLOGS_DIR, "posts.json");

function estimateReadTime(text) {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function isExternalOrAbsolute(url) {
  return /^([a-z]+:)?\/\//i.test(url) || url.startsWith("/") || url.startsWith("#") || url.startsWith("mailto:");
}

// Rewrites relative image/link paths (e.g. "images/cover.png") so they resolve
// correctly from blogs.html at the site root, e.g. "blogs/<slug>/images/cover.png".
function rendererForSlug(slug) {
  const marked = new Marked();
  const base = `blogs/${slug}/`;

  // Only image paths get rewritten to the post's own folder, since post images
  // live in blogs/<slug>/images/. Regular links are left exactly as written —
  // they usually point at real site pages (e.g. "sites.html"), not post assets.
  marked.use({
    renderer: {
      image(href, title, text) {
        const src = isExternalOrAbsolute(href) ? href : base + href;
        return `<img src="${src}" alt="${text || ""}"${title ? ` title="${title}"` : ""}>`;
      },
    },
  });

  return marked;
}

function buildPosts() {
  if (!fs.existsSync(BLOGS_DIR)) {
    console.error(`No blogs directory found at ${BLOGS_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(BLOGS_DIR, { withFileTypes: true });
  const postDirs = entries.filter((e) => e.isDirectory());

  const posts = postDirs
    .map((dir) => {
      const slug = dir.name;
      const mdPath = path.join(BLOGS_DIR, slug, "index.md");

      if (!fs.existsSync(mdPath)) {
        console.warn(`Skipping "${slug}": no index.md found.`);
        return null;
      }

      const raw = fs.readFileSync(mdPath, "utf-8");
      const { data, content } = matter(raw);

      if (!data.title || !data.date) {
        throw new Error(`Post "${slug}" is missing required frontmatter (title, date).`);
      }

      const marked = rendererForSlug(slug);

      return {
        slug: data.slug || slug,
        title: data.title,
        date: data.date,
        excerpt: data.excerpt || "",
        tags: data.tags || [],
        readTime: estimateReadTime(content),
        html: marked.parse(content),
      };
    })
    .filter(Boolean);

  // Newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2));
  console.log(`Wrote ${posts.length} post(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

buildPosts();
