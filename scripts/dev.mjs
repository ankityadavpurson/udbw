// `yarn dev`: serves the UI with Vite (hot reload) and opens Electron on it. Closing the window stops the server.
import { createServer } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron'); // the path of the Electron binary

// macOS names the app menu after the bundle, which is "Electron" for the stock binary. Packaged builds get "UDBW" from
// `productName`; for `yarn dev` the bundle's Info.plist in node_modules is renamed (idempotent, restored by a reinstall).
if (process.platform === 'darwin') {
  const plist = path.join(path.dirname(electron), '..', 'Info.plist');
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) spawnSync('plutil', ['-replace', key, '-string', 'UDBW', plist]);
}

const server = await createServer({ configFile: 'vite.config.js' });
await server.listen();
const url = server.resolvedUrls?.local?.[0];
if (!url) {
  console.error('The Vite dev server did not report a URL.');
  await server.close();
  process.exit(1);
}
console.log(`UI served at ${url}`);

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
const stop = async code => {
  await server.close();
  process.exit(code ?? 0);
};
child.on('exit', stop);
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
