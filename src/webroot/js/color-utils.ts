import presetData from './presets.json';

const KEYS: string[] = presetData.keys;
const DATA: Record<string, string[]> = presetData.data;

export function getPresetColors(preset: string, isDark: boolean): Record<string, string> | null {
  const arr = DATA[preset + '_' + (isDark ? 'dark' : 'light')];
  if (!arr) return null;
  const vars: Record<string, string> = {};
  for (let i = 0; i < KEYS.length; i++) vars[KEYS[i]] = arr[i];
  return vars;
}

const PRESET_HUES: [string, number][] = [
  ['red', 2], ['orange', 28], ['yellow', 42], ['green', 149],
  ['cyan', 190], ['blue', 221], ['purple', 265], ['pink', 329], ['grey', 0],
];

function argbToHsl(argb: number): [number, number, number] {
  const r = ((argb >>> 16) & 0xFF) / 255;
  const g = ((argb >>> 8) & 0xFF) / 255;
  const b = (argb & 0xFF) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

export function presetClosestTo(hexSeed: string): string {
  const argb = parseInt(hexSeed.startsWith('#') ? hexSeed.slice(1) : hexSeed, 16) | 0xFF000000;
  const [hue, sat] = argbToHsl(argb);
  if (sat < 10) return 'blue';
  let closest = 'blue';
  let minDist = Infinity;
  for (const [name, pHue] of PRESET_HUES) {
    const dist = Math.min(Math.abs(hue - pHue), 360 - Math.abs(hue - pHue));
    if (dist < minDist) { minDist = dist; closest = name; }
  }
  return closest;
}
