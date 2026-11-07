import logo from './specter-logo.svg?raw';

type Swatch = {
  accent: string;
  tint: string;
  hi: string;
  mid: string;
  low: string;
  deep: string;
};

/** Logo colors per theme preset, applied as `--brand-*` custom properties. */
export const BRAND_PALETTE: Record<string, Swatch> & { blue: Swatch } = {
  blue:   { accent: '#1363ec', tint: '#e3e2e9', hi: '#6197f2', mid: '#0b3782', low: '#0f4db7', deep: '#031027' },
  yellow: { accent: '#f5ba0a', tint: '#ebe1d4', hi: '#f8d15b', mid: '#876706', low: '#be9108', deep: '#281f02' },
  red:    { accent: '#da2d25', tint: '#f1dedc', hi: '#e6726d', mid: '#791914', low: '#aa231c', deep: '#240706' },
  purple: { accent: '#6e2fd0', tint: '#e7e0e8', hi: '#9e74df', mid: '#3d1a73', low: '#5525a1', deep: '#120822' },
  green:  { accent: '#00ff7d', tint: '#dfe4dc', hi: '#54ffa8', mid: '#008d45', low: '#00c661', deep: '#002a15' },
  orange: { accent: '#ff7400', tint: '#f0dfd7', hi: '#ffa254', mid: '#8d4000', low: '#c65a00', deep: '#2a1300' },
  pink:   { accent: '#ee1190', tint: '#eedfe2', hi: '#f45fb4', mid: '#840950', low: '#b90d70', deep: '#270318' },
  cyan:   { accent: '#00d6ff', tint: '#dee3e6', hi: '#54e3ff', mid: '#00768d', low: '#00a6c6', deep: '#00232a' },
  grey:   { accent: '#808080', tint: '#e3e2e2', hi: '#aaaaaa', mid: '#464646', low: '#636363', deep: '#151515' },
};

/**
 * Inlines the logo once. Light/dark is resolved in CSS (app.css), so only a
 * preset change needs a repaint.
 */
export function initBrand(): void {
  const host = document.getElementById('app-brand');
  if (!host) return;
  host.innerHTML = logo;
  document.addEventListener('specter-theme-applied', (event) => {
    const { preset } = (event as CustomEvent<{ preset: string }>).detail;
    const swatch = (Object.hasOwn(BRAND_PALETTE, preset) ? BRAND_PALETTE[preset] : undefined) ?? BRAND_PALETTE.blue;
    for (const [name, value] of Object.entries(swatch)) {
      host.style.setProperty(`--brand-${name}`, value);
    }
    host.dataset.ready = '1';
  });
}
