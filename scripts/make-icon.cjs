// Renders the logo to build/icon.png (the window and installer icon) and build/icon-mac.png (the same on macOS's icon grid:
// the artwork fills 80% of the canvas, so it is not bigger than the other icons in the dock).
// Run with: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const logoPath =
  'M4 2H2v8h2V2zm16 0h2v8h-2V2zm-6 6h-4V2H4v2h4v4H4v2h4v4H4v2h4v4H4v2h6v-6h4v6h2v-6h4v-2h-4v-4h4V8h-4V2h-2v6zm-4 6v-4h4v4h-4zM20 2h-4v2h4V2zM2 14h2v8H2v-8zm14 6h4v2h-4v-2zm6-6h-2v8h2v-8z';
const render = inset => {
  const box = SIZE - inset * 2;
  const logo = box * 0.66;
  const offset = inset + box * 0.17;
  return `<body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="${inset}" y="${inset}" width="${box}" height="${box}" rx="${(box * 96) / SIZE}" fill="#252529"/>
  <g transform="translate(${offset} ${offset}) scale(${logo / 24})" fill="#ffffff"><path d="${logoPath}"/></g>
</svg></body>`;
};
const icons = { 'icon.png': render(0), 'icon-mac.png': render(SIZE * 0.1) };

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  for (const [name, html] of Object.entries(icons)) {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
    const out = path.join(__dirname, '..', 'build', name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log('wrote', out, image.getSize());
  }
  app.quit();
});
