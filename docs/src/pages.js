// Every page is a Markdown file in content/. `nav` pages appear in the top bar.
export const pages = [
  { slug: 'download', title: 'Download', description: 'Download UDBW, the Universal DB Workbench desktop app, for Windows, macOS and Linux. Installers are built from source on GitHub and include an uninstaller.', nav: true },
  { slug: 'getting-started', title: 'Get started', description: 'Install UDBW, add your first MySQL, PostgreSQL, Supabase, MongoDB or Firestore connection, and run your first query in a few minutes.', nav: true },
  { slug: 'connections', title: 'Connections', description: 'How to connect UDBW to MySQL, PostgreSQL, Supabase, MongoDB and Firebase Firestore, including SSH tunnels and the Production and Read-only modes.', nav: true },
  { slug: 'features', title: 'Features', description: 'What UDBW can do: browse tables and collections, run and cancel queries, edit records, MongoDB and Firestore command syntax, and export to JSON, CSV, Excel or SQL.', nav: true },
  { slug: 'security', title: 'Security', description: 'How UDBW protects database credentials: OS keychain encryption, secrets kept out of the UI, TLS verification, SSH host key checks, and what stays your responsibility.', nav: true },
  { slug: 'development', title: 'Development', description: 'Build UDBW from source, run its tests, and see how the CI/CD pipeline versions and publishes releases from commit messages.', nav: true },
  { slug: 'privacy', title: 'Privacy policy', description: 'UDBW sends no data anywhere except to the databases you configure and an update check against GitHub releases. No telemetry and no accounts.' },
  { slug: 'code-signing', title: 'Code signing policy', description: 'How UDBW installers are built on GitHub Actions, and the status of free code signing from SignPath Foundation.' }
];

export const REPO = 'https://github.com/ankityadavpurson/udbw';
export const BASE = '/udbw';

const files = import.meta.glob('../content/*.md', { query: '?raw', import: 'default', eager: true });
export const source = slug => files[`../content/${slug}.md`] || '';
