import { hctHueChroma } from './hct.js';
import presetData from './presets.json';

const KEYS: string[] = presetData.keys;
const DATA: Record<string, string[]> = presetData.data;

/** Look up the CSS custom-property map for a colour preset in light or dark mode. Returns `null` for unknown presets. */
export function getPresetColors(preset: string, isDark: boolean): Record<string, string> | null {
  const arr = DATA[preset + '_' + (isDark ? 'dark' : 'light')];
  if (!arr) return null;
  const vars: Record<string, string> = {};
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i];
    const v = arr[i];
    if (k && v) vars[k] = v;
  }
  return vars;
}

/** HCT hues for each preset's seed color (computed via @material/material-color-utilities Hct). */
const PRESET_HUES: [string, number][] = [
  ['red', 25.8], ['orange', 49.1], ['yellow', 87.2], ['green', 153.8],
  ['cyan', 218.9], ['blue', 270.4], ['purple', 303.4], ['pink', 356.0],
];

/** Return the name of the preset palette closest to a hex colour seed (e.g. `'#1157CE'` → `'blue'`). */
export function presetClosestTo(hexSeed: string): string {
  const argb = parseInt(hexSeed.startsWith('#') ? hexSeed.slice(1) : hexSeed, 16) | 0xFF000000;
  const { hue, chroma } = hctHueChroma(argb);
  // Match Android's ColorScheme.MIN_CHROMA: low-chroma seeds fall back to
  // Google Blue. Do not use the fixed "grey" palette here — TonalSpot on a
  // neutral seed produces a chromatic (teal) palette, not a neutral one.
  if (chroma < 5) return 'blue';
  let closest = 'blue';
  let minDist = Infinity;
  for (const [name, pHue] of PRESET_HUES) {
    const dist = Math.min(Math.abs(hue - pHue), 360 - Math.abs(hue - pHue));
    if (dist < minDist) { minDist = dist; closest = name; }
  }
  return closest;
}
