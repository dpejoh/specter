import { cfgGet, cfgSet } from './cfg.js';

interface FontDef {
  name: string;
  family: string;
  filename: string;
  toggleKey: string;
  cssVar: string;
  styleId: string;
  /** The @font-face is declared inline in index.html (and inlined by Vite). */
  staticFace?: boolean;
}

const FONTS: FontDef[] = [
  {
    name: 'Google Sans Variable',
    family: '"Google Sans Variable"',
    filename: 'GoogleSans-var.woff2',
    toggleKey: 'toggle_custom_font',
    cssVar: '--md-ref-typeface-brand',
    styleId: 'sp-font-sans',
    staticFace: true,
  },
  {
    name: 'JetBrains Mono Variable',
    family: '"JetBrains Mono Variable"',
    filename: 'JetBrainsMono-var.woff2',
    toggleKey: 'toggle_mono_font',
    cssVar: '--sp-font-mono',
    styleId: 'sp-font-mono',
  },
];

function ensureAndApply(font: FontDef): void {
  applyFont(font, `./fonts/${font.filename}`);
}

function wireOne(font: FontDef, switchId: string): void {
  const sw = document.getElementById(switchId) as MdSwitch | null;
  if (!sw) return;

  cfgGet(font.toggleKey, '1').then(val => {
    sw.selected = val !== '0';
  });

  sw.addEventListener('change', () => {
    toggleOne(font, sw.selected);
  });
}

function toggleOne(font: FontDef, on: boolean): void {
  cfgSet(font.toggleKey, on ? '1' : '0');
  if (on) {
    ensureAndApply(font);
  } else {
    removeFont(font);
  }
}

function applyFont(font: FontDef, src: string): void {
  removeFont(font);

  if (!font.staticFace) {
    const format = font.filename.endsWith('.woff2') ? 'woff2-variations' : 'truetype-variations';

    const style = document.createElement('style');
    style.id = font.styleId;
    style.textContent = `
      @font-face {
        font-family: ${font.family};
        src: url("${src}") format("${format}");
        font-weight: 1 1000;
        font-stretch: 1 100;
        font-display: swap;
      }
    `;
    document.head.appendChild(style);
  }

  if (font.cssVar === '--md-ref-typeface-brand') {
    document.documentElement.style.setProperty('--md-ref-typeface-brand', font.family);
    document.documentElement.style.setProperty('--md-ref-typeface-plain', font.family);
  } else {
    document.documentElement.style.setProperty(font.cssVar, font.family);
  }
}

function removeFont(font: FontDef): void {
  const existing = document.getElementById(font.styleId);
  if (existing) existing.remove();
  if (font.cssVar === '--md-ref-typeface-brand') {
    document.documentElement.style.removeProperty('--md-ref-typeface-brand');
    document.documentElement.style.removeProperty('--md-ref-typeface-plain');
  } else {
    document.documentElement.style.removeProperty(font.cssVar);
  }
}

export async function initFonts(): Promise<void> {
  await Promise.all(FONTS.map(font =>
    cfgGet(font.toggleKey, '1').then(enabled => {
      if (enabled === '1') ensureAndApply(font);
    })
  ));
}

export function wireFontToggles(): void {
  wireOne(FONTS[0]!, 'custom-font-switch');
  wireOne(FONTS[1]!, 'mono-font-switch');
}
