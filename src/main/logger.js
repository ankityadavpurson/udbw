const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// A plain text log in the app's log folder (Help -> Open log folder). It rotates at 2 MB, keeps one older file, and
// hides the password in anything that looks like a connection URL.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINE = 4000;

const logFile = () => path.join(app.getPath('logs'), 'main.log');

// scheme://user:password@host -> scheme://user:***@host
const redact = text => String(text).replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1***@');

const describe = value => (value instanceof Error ? `${value.stack || value.message}` : typeof value === 'string' ? value : JSON.stringify(value));

function write(level, parts) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(parts.map(describe).join(' ')).slice(0, MAX_LINE)}\n`;
  try {
    const file = logFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, line);
  } catch (_) { /* logging must never break the app */ }
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line.trimEnd());
}

const logger = {
  info: (...parts) => write('info', parts),
  warn: (...parts) => write('warn', parts),
  error: (...parts) => write('error', parts)
};

// Records crashes (main process errors, a renderer or helper process dying) instead of losing them.
function installCrashHandlers() {
  let shown = false;
  process.on('uncaughtException', err => {
    logger.error('Uncaught exception:', err);
    if (shown) return;
    shown = true;
    dialog.showErrorBox('UDBW', `An unexpected error occurred:\n\n${err?.message || err}\n\nDetails were written to the log (Help → Open log folder).`);
  });
  process.on('unhandledRejection', reason => logger.error('Unhandled promise rejection:', reason));
  app.on('child-process-gone', (_event, details) => logger.error('Child process gone:', details));
}

module.exports = { logger, logFile, redact, installCrashHandlers };
