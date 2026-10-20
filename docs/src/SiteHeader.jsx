import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, ButtonLink, Divider, DownloadIcon, Drawer, GithubIcon, MenuIcon, ThemeToggle, useMediaQuery } from 'xedonium';
import { REPO, pages } from './pages.js';

const router = { linkComponent: Link, linkProp: 'to' };
const iconLink = 'flex h-9 w-9 items-center justify-center text-app-muted transition-colors hover:text-app-text [&>svg]:h-[18px] [&>svg]:w-[18px]';

const Logo = () => (
  <svg className="h-6 w-6 shrink-0 text-app-text" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 2H2v8h2V2zm16 0h2v8h-2V2zm-6 6h-4V2H4v2h4v4H4v2h4v4H4v2h4v4H4v2h6v-6h4v6h2v-6h4v-2h-4v-4h4V8h-4V2h-2v6zm-4 6v-4h4v4h-4zM20 2h-4v2h4V2zM2 14h2v8H2v-8zm14 6h4v2h-4v-2zm6-6h-2v8h2v-8z" />
  </svg>
);

// Top row: brand and full name on the left, then the repository, the theme and the download. The docs sections sit in
// their own row underneath. Below the md breakpoint the sections and the theme toggle move into the menu drawer, and the
// download button shrinks to its icon.
export default function SiteHeader() {
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const wide = useMediaQuery('(min-width: 768px)');
  // The drawer is for small screens: if the window grows past the breakpoint while it is open, close it.
  useEffect(() => { if (wide) setMenu(false); }, [wide]);
  const onDownloadPage = pathname === '/download/'; // the page already has the download button
  const sections = pages.filter(page => page.nav && page.slug !== 'download');

  return (
    <header className="sticky top-0 z-40 border-b border-app-border bg-app-bg/95 backdrop-blur">
      <div className="px-4">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-app-text" aria-label="UDBW home">
            <Logo />
            <span className="text-base font-bold tracking-tight">UDBW</span>
            <span className="hidden border-l border-app-border pl-2.5 text-xs text-app-muted sm:inline">Universal DB Workbench</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <a href={REPO} className={iconLink} aria-label="UDBW on GitHub" title="UDBW on GitHub"><GithubIcon /></a>
            <div className="hidden md:block"><ThemeToggle variant="toolbar" /></div>
            {!onDownloadPage && (
              <ButtonLink href="/download/" aria-label="Download" title="Download" className="ml-2" {...router}>
                <DownloadIcon />
                <span className="hidden sm:inline">Download</span>
              </ButtonLink>
            )}
            <Button variant="flat" className="md:hidden" aria-label="Open menu" onClick={() => setMenu(true)}><MenuIcon /></Button>
          </div>
        </div>
      </div>
      <div className="hidden border-t border-app-border px-4 md:block">
        <nav aria-label="Main" className="mx-auto flex h-10 w-full max-w-5xl items-stretch">
          {sections.map(page => {
            const active = pathname === `/${page.slug}/`;
            return (
              <Link key={page.slug} to={`/${page.slug}/`} aria-current={active ? 'page' : undefined}
                className={`relative flex items-center pr-6 text-sm font-medium transition-colors ${active ? 'text-app-text after:absolute after:inset-x-0 after:bottom-0 after:right-6 after:h-0.5 after:bg-app-strong' : 'text-app-muted hover:text-app-text'}`}>
                {page.title}
              </Link>
            );
          })}
        </nav>
      </div>

      <Drawer open={menu && !wide} onClose={() => setMenu(false)} title="UDBW" side="right" width="max-w-xs">
        <nav aria-label="Menu" className="flex flex-col py-1">
          {pages.filter(page => page.nav).map(page => (
            <Link key={page.slug} to={`/${page.slug}/`} onClick={() => setMenu(false)} aria-current={pathname === `/${page.slug}/` ? 'page' : undefined}
              className={`px-4 py-2.5 text-sm font-medium ${pathname === `/${page.slug}/` ? 'bg-app-card text-app-text' : 'text-app-muted hover:text-app-text'}`}>
              {page.title}
            </Link>
          ))}
          <Divider className="my-2" />
          <div className="flex items-center justify-between px-4 py-1">
            <span className="text-sm font-medium text-app-muted">Theme</span>
            <ThemeToggle variant="toolbar" />
          </div>
        </nav>
      </Drawer>
    </header>
  );
}
