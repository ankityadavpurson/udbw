// After `vite build`: writes one HTML file per page with the page's text already inside #root, so the content is there
// for crawlers, reviewers and readers without JavaScript. React replaces it when the script loads. Each page also gets
// its own title, description, canonical URL and social tags. Also writes sitemap.xml and 404.html (the same shell, marked
// noindex) so GitHub Pages serves the app for unknown paths.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { pages, BASE } = await import(pathToFileURL(join(root, 'src/pages.js')).href).catch(async () => {
  // pages.js uses Vite's import.meta.glob, which Node lacks: read the page list from the source text instead.
  const text = readFileSync(join(root, 'src/pages.js'), 'utf8');
  const list = text.match(/export const pages = (\[[\s\S]*?\n\]);/)[1];
  return { pages: new Function(`return ${list}`)(), BASE: text.match(/BASE = '([^']*)'/)[1] };
});

const SITE = 'UDBW';
const FULL_NAME = 'Universal DB Workbench';
const ORIGIN = 'https://ankityadavpurson.github.io';
const REPO = 'https://github.com/ankityadavpurson/udbw';
const HOME_TITLE = `${SITE} — ${FULL_NAME}`;
const HOME_DESCRIPTION = 'UDBW (Universal DB Workbench) is a free, open-source desktop client for MySQL, PostgreSQL, Supabase, MongoDB and Firestore on Windows, macOS and Linux.';

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const escape = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nav = pages.filter(p => p.nav).map(p => `<a href="${BASE}/${p.slug}/">${escape(p.title)}</a>`).join(' · ');
const urlOf = slug => `${ORIGIN}${BASE}/${slug === 'home' ? '' : `${slug}/`}`;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE,
  alternateName: FULL_NAME,
  description: HOME_DESCRIPTION,
  url: urlOf('home'),
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Windows, macOS, Linux',
  downloadUrl: `${REPO}/releases/latest`,
  license: 'https://opensource.org/licenses/MIT',
  image: `${ORIGIN}${BASE}/icon.png`,
  author: { '@type': 'Person', name: 'Ankit Yadav', url: 'https://github.com/ankityadavpurson' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
};

function head({ slug, title, desc, indexable = true }) {
  const url = urlOf(slug);
  const image = `${ORIGIN}${BASE}/icon.png`;
  const tags = indexable
    ? [
        `<link rel="canonical" href="${url}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${SITE}">`,
        `<meta property="og:title" content="${escape(title)}">`,
        `<meta property="og:description" content="${escape(desc)}">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:image" content="${image}">`,
        `<meta name="twitter:card" content="summary">`,
        `<meta name="twitter:title" content="${escape(title)}">`,
        `<meta name="twitter:description" content="${escape(desc)}">`,
        `<meta name="twitter:image" content="${image}">`
      ]
    : ['<meta name="robots" content="noindex">'];
  if (slug === 'home' && indexable) tags.push(`<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`);
  return tags.map(tag => `  ${tag}`).join('\n');
}

function write(file, { slug, title, desc, html, indexable }) {
  const out = shell
    .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta name="description" content=").*?(">)/, `$1${escape(desc)}$2`)
    .replace('</head>', `${head({ slug, title, desc, indexable })}\n</head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="prerender"><p><a href="${BASE}/">${SITE}</a> · ${nav}</p>${html}</div></div>`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, out);
}

const render = slug => marked.parse(readFileSync(join(root, 'content', `${slug}.md`), 'utf8'), { gfm: true }).replace(/href="\//g, `href="${BASE}/`);

const home = { slug: 'home', title: HOME_TITLE, desc: HOME_DESCRIPTION, html: `<h1>${HOME_TITLE}</h1>${render('home')}` };
write(join(dist, 'index.html'), home);
for (const page of pages) {
  write(join(dist, page.slug, 'index.html'), { slug: page.slug, title: `${page.title} · ${SITE}`, desc: page.description, html: `<h1>${escape(page.title)}</h1>${render(page.slug)}` });
}
write(join(dist, '404.html'), { ...home, indexable: false });

const today = new Date().toISOString().slice(0, 10);
const urls = ['home', ...pages.map(p => p.slug)].map(slug => `  <url><loc>${urlOf(slug)}</loc><lastmod>${today}</lastmod></url>`).join('\n');
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`prerendered ${pages.length + 1} pages, sitemap.xml with ${pages.length + 1} URLs`);
