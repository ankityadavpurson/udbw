// Every page is a Markdown file in content/. `nav` pages appear in the top bar.
export const pages = [
  { slug: 'download', title: 'Download', description: 'Installers for Windows, macOS and Linux.', nav: true },
  { slug: 'getting-started', title: 'Get started', description: 'Install the app, add a connection and run your first query.', nav: true },
  { slug: 'connections', title: 'Connections', description: 'How to connect to each supported database.', nav: true },
  { slug: 'features', title: 'Features', description: 'Browsing, querying, command syntax and export.', nav: true },
  { slug: 'security', title: 'Security', description: 'How the app protects credentials and what you are responsible for.', nav: true },
  { slug: 'development', title: 'Development', description: 'Building from source, tests, CI/CD and releases.', nav: true },
  { slug: 'privacy', title: 'Privacy policy', description: 'What UDBW does and does not send over the network.' },
  { slug: 'code-signing', title: 'Code signing policy', description: 'How UDBW installers are built and signed.' }
];

export const REPO = 'https://github.com/ankityadavpurson/udbw';
export const BASE = '/udbw';

const files = import.meta.glob('../content/*.md', { query: '?raw', import: 'default', eager: true });
export const source = slug => files[`../content/${slug}.md`] || '';
