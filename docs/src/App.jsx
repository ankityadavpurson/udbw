import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ButtonLink, Card, Divider, Grid, HelperText, Markdown, NotFoundPage, PageLayout, PageTitle, TextLink, useDocumentTitle } from 'xedonium';
import { REPO, pages, source } from './pages.js';
import LatestRelease from './LatestRelease.jsx';
import SiteHeader from './SiteHeader.jsx';

const SITE = 'UDBW';
const FULL_NAME = 'Universal DB Workbench';
const routerLink = { linkComponent: Link, linkProp: 'to' };

// Reading rhythm for Markdown pages: roomier text, space above headings, and a heading stays close to what it introduces.
const PROSE = '!gap-5 !text-[15px] !leading-7 [&>h2]:mt-8 [&>h3]:mt-4 [&>h2+*]:-mt-2 [&>h3+*]:-mt-2 [&_ul]:!gap-2 [&_ol]:!gap-2';

function Doc({ page }) {
  useDocumentTitle(page.title, SITE);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <article className="pb-12 pt-2">
      <PageTitle className="mb-6">{page.title}</PageTitle>
      {page.slug === 'download' && <div className="mb-8"><LatestRelease /></div>}
      <Markdown className={PROSE} {...routerLink} openLinksInNewTab>{source(page.slug)}</Markdown>
    </article>
  );
}

const highlights = [
  ['Five databases', 'MySQL, PostgreSQL, Supabase (SQL and REST), MongoDB and Firestore in one workspace.'],
  ['Safe by default', 'Production and read-only modes, confirmations before destructive statements, parameterized edits.'],
  ['Private', 'Secrets are encrypted with your OS keychain and never reach the UI. No telemetry.'],
  ['Open source', 'MIT licensed. Windows, macOS and Linux installers are built in the open on GitHub.']
];

function Home() {
  useDocumentTitle(`${SITE} — ${FULL_NAME}`);
  const [intro, ...rest] = source('home').split('## Documentation');
  return (
    <div className="pb-10">
      <section className="py-8">
        <PageTitle>{SITE}<span className="sr-only"> — {FULL_NAME}</span></PageTitle>
        <p aria-hidden="true" className="mt-1 text-sm font-medium uppercase tracking-widest text-app-muted">{FULL_NAME}</p>
        <div className="mt-4"><LatestRelease variant="badge" /></div>
        <div className="mt-3 max-w-2xl text-lg text-app-muted"><Markdown {...routerLink}>{intro.trim()}</Markdown></div>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/download/" {...routerLink}>Download</ButtonLink>
          <ButtonLink href="/getting-started/" variant="secondary" {...routerLink}>Get started</ButtonLink>
        </div>
      </section>
      <Grid cols={2} gap={4} className="mb-8">
        {highlights.map(([title, text]) => <Card key={title} title={title}><p className="text-sm text-app-muted">{text}</p></Card>)}
      </Grid>
      <Markdown className={PROSE} {...routerLink}>{`## Documentation${rest.join('## Documentation')}`}</Markdown>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <PageLayout maxWidth="max-w-5xl">
        <Routes>
          <Route path="/" element={<Home />} />
          {pages.map(page => <Route key={page.slug} path={`/${page.slug}/`} element={<Doc page={page} />} />)}
          <Route path="*" element={<NotFoundPage homeHref="/" />} />
        </Routes>
      </PageLayout>
      <footer className="px-4 pb-8">
        <Divider />
        <HelperText className="mt-4 text-center">
          MIT licensed · <TextLink href="/privacy/" {...routerLink}>Privacy policy</TextLink> · <TextLink href="/code-signing/" {...routerLink}>Code signing policy</TextLink> · <TextLink href={`${REPO}/issues`}>Report an issue</TextLink>
        </HelperText>
      </footer>
    </div>
  );
}
