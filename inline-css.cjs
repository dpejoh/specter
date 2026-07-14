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
