// After `vite build`: writes one HTML file per page with the page's text already inside #root, so the content is there
// for crawlers, reviewers and readers without JavaScript. React replaces it when the script loads. Also writes 404.html
// (the same shell) so GitHub Pages serves the app for unknown paths.
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
const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const escape = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nav = pages.filter(p => p.nav).map(p => `<a href="${BASE}/${p.slug}/">${escape(p.title)}</a>`).join(' · ');
const description = 'UDBW (Universal DB Workbench): a cross-platform desktop client for MySQL, PostgreSQL, Supabase, MongoDB and Firestore.';

function write(file, title, desc, html) {
  const out = shell
    .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta name="description" content=").*?(">)/, `$1${escape(desc)}$2`)
    .replace('<div id="root"></div>', `<div id="root"><div class="prerender"><p><a href="${BASE}/">${SITE}</a> · ${nav}</p>${html}</div></div>`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, out);
}

const render = slug => marked.parse(readFileSync(join(root, 'content', `${slug}.md`), 'utf8'), { gfm: true }).replace(/href="\//g, `href="${BASE}/`);

write(join(dist, 'index.html'), `${SITE} — Universal DB Workbench`, description, `<h1>${SITE} — Universal DB Workbench</h1>${render('home')}`);
for (const page of pages) write(join(dist, page.slug, 'index.html'), `${page.title} · ${SITE}`, page.description, `<h1>${escape(page.title)}</h1>${render(page.slug)}`);
writeFileSync(join(dist, '404.html'), readFileSync(join(dist, 'index.html'), 'utf8'));
console.log(`prerendered ${pages.length + 1} pages`);
