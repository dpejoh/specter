import { getCurrentMappedPreset } from './theme.js';

const PRESETS = new Set(['blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'grey']);

function brandSource(preset: string, dark: boolean): string {
  const name = PRESETS.has(preset) ? preset : 'blue';
  return `assets/brand/specter-${dark ? 'dark' : 'light'}-${name}.svg`;
}

export function updateBrand(): void {
  const img = document.getElementById('app-brand') as HTMLImageElement | null;
  if (!img) return;
  const dark = document.documentElement.getAttribute('data-theme-resolved') === 'dark';
  const next = brandSource(getCurrentMappedPreset(), dark);
  if (img.getAttribute('src') !== next) img.setAttribute('src', next);
  img.dataset.ready = '1';
}

export function initBrand(): void {
  document.addEventListener('specter-theme-applied', updateBrand);
}
