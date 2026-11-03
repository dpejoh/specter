const fs = require('fs');
const path = require('path');
const assets = fs.readdirSync('Module/webroot/assets');
const cssFile = assets.find(f => /^index-[a-zA-Z0-9_-]+\.css$/.test(f));
if (!cssFile) { console.warn('No index CSS found in', assets); process.exit(0); }
const css = fs.readFileSync(path.join('Module/webroot/assets', cssFile), 'utf-8');
let html = fs.readFileSync('Module/webroot/index.html', 'utf-8');
html = html.replace(/<link rel="stylesheet" crossorigin[^>]+>/, `<style>${css}</style>`);
fs.writeFileSync('Module/webroot/index.html', html);
fs.unlinkSync(path.join('Module/webroot/assets', cssFile));
console.log(`Inlined ${cssFile} (${(css.length / 1024).toFixed(1)} KB)`);

// Preload the dynamic Material component graph.
const manifestPath = 'Module/webroot/.vite/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const files = new Set();
  const collect = (key) => {
    const item = manifest[key];
    if (!item || !item.file || files.has(item.file)) return;
    files.add(item.file);
    for (const dep of item.imports || []) collect(dep);
  };
  collect('js/material-core.ts');

  const missing = [...files].filter(f => !html.includes(`href="./${f}"`));
  if (missing.length) {
    const links = missing.map(f => `<link rel="modulepreload" crossorigin href="./${f}">`).join('\n  ');
    html = html.replace('</head>', `  ${links}\n</head>`);
    fs.writeFileSync('Module/webroot/index.html', html);
    console.log(`Preloaded ${missing.length} Material core chunks`);
  }
  fs.rmSync('Module/webroot/.vite', { recursive: true, force: true });
}
