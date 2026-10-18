// `yarn dev`: serves the UI with Vite (hot reload) and opens Electron on it. Closing the window stops the server.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron'); // the path of the Electron binary

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
