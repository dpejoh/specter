import { getPresetColors, presetClosestTo } from './color-utils.js';
import { cfgGet, cfgSet } from './cfg.js';
import { exec, getModuleDir } from './bridge.js';
import { shellEscape } from './utils.js';

export type MonetPalette = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

type MonetData = {
  seed?: string;
  ts?: number;
  palette?: MonetPalette | null;
};

export const PRESETS: Record<string, string> = {
  blue:   '#1157CE',
  yellow: '#be9108',
  red:    '#B3251E',
  purple: '#7438D2',
  green:  '#006C35',
  orange: '#9A4600',
  pink:   '#B60D6E',
  cyan:   '#00687C',
  grey:   '#5E5E5E',
};

let currentPreset: string = 'monet';
let currentMappedPreset: string = 'monet';
let monetSeed: string | null = null;
let monetPalette: MonetPalette | null = null;
let monetTs = 0;

export function getCurrentPreset(): string {
  return currentPreset;
}

/** Fixed preset, or the closest fixed palette for Monet. */
export function getCurrentMappedPreset(): string {
  if (currentPreset !== 'monet') return currentPreset;
  return currentMappedPreset && currentMappedPreset !== 'monet' ? currentMappedPreset : 'blue';
}

function notifyThemeApplied(isDark: boolean) {
  document.dispatchEvent(new CustomEvent('specter-theme-applied', {
    detail: { preset: getCurrentMappedPreset(), dark: isDark },
  }));
}

export async function initTheme(savedMode: string) {
  const monetSwitch = await cfgGet('theme_monet_switch');
  const savedPreset = await cfgGet('theme_preset', 'monet');

  if (monetSwitch === '1') {
    currentPreset = 'monet';
  } else if (monetSwitch === '0') {
    if (savedPreset && savedPreset !== 'monet') {
      currentPreset = savedPreset;
    } else {
      currentPreset = (await cfgGet('theme_fixed_preset', 'blue')) || 'blue';
    }
  } else {
    currentPreset = savedPreset || 'monet';
  }
  const mode = savedMode || 'dark';
  document.documentElement.setAttribute('data-theme-preset', currentPreset);

  if (currentPreset === 'monet') {
    await applyMonetPreset(mode);
  } else {
    applyMode(mode);
  }

  wireThemeControls();
  wireVisibilityRefresh();
}

function resolveMode(mode: string): string {
  if (mode === 'amoled') return 'dark';
  return mode === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
}

function normalizeMonetData(raw: unknown): MonetData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const seed = typeof data.seed === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.seed)
    ? data.seed.toLowerCase()
    : undefined;

  let palette: MonetPalette | null = null;
  const p = data.palette as { light?: unknown; dark?: unknown } | null | undefined;
  if (p && typeof p === 'object' && p.light && p.dark
      && typeof p.light === 'object' && typeof p.dark === 'object') {
    palette = {
      light: p.light as Record<string, string>,
      dark: p.dark as Record<string, string>,
    };
  }
  if (!seed && !palette) return null;
  return { seed, palette, ts: Number(data.ts) || 0 };
}

function clearMonetCache() {
  monetSeed = null;
  monetPalette = null;
  monetTs = 0;
  try {
    localStorage.removeItem('monet_seed');
    localStorage.removeItem('monet_seed_ts');
    localStorage.removeItem('specter_theme_vars');
    localStorage.removeItem('specter_theme_seed');
  } catch {}
}

async function runMonetScript(): Promise<MonetData | null> {
  const dir = getModuleDir();
  if (!dir) return null;
  try {
    const result = await exec(`sh ${shellEscape(dir + '/features/monet.sh')} --json 2>/dev/null`);
    const line = (result.stdout || '').trim().split('\n')
      .filter(l => l.trim().startsWith('{'))
      .pop();
    return line ? normalizeMonetData(JSON.parse(line)) : null;
  } catch {
    return null;
  }
}

async function readFileMonet(): Promise<MonetData | null> {
  try {
    const res = await fetch('./json/monet.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    return normalizeMonetData(await res.json());
  } catch {
    return null;
  }
}

async function readStateMonet(): Promise<MonetData | null> {
  const preloaded = (window as any).__monetPromise;
  if (!preloaded || typeof preloaded?.then !== 'function') return null;
  try {
    return normalizeMonetData(await preloaded);
  } catch {
    return null;
  }
}

async function loadMonetData(force = false, onlyIfNewer = false): Promise<MonetData | null> {
  if (!force) {
    const fileData = await readFileMonet();
    const stateData = await readStateMonet();

    // A missing file means the watcher has not run yet (fresh install/update,
    // or a ROM where inotifyd is unavailable). Run the extractor once rather
    // than trusting a seed-only state snapshot.
    if (!onlyIfNewer && !fileData) {
      const scripted = await runMonetScript();
      if (scripted) return scripted;
    }

    const candidates = [fileData, stateData].filter((d): d is MonetData => !!d && !!(d.seed || d.palette));
    // Prefer a payload that carries the full system palette; otherwise use
    // the newest seed-only payload (ROMs without system role resources).
    const best = candidates.find(d => d.palette)
      || candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    if (best && (!onlyIfNewer || !monetTs || (best.ts || 0) > monetTs)) return best;

    if (!onlyIfNewer && (monetSeed || monetPalette)) {
      return { seed: monetSeed || undefined, palette: monetPalette, ts: monetTs };
    }

    // A visibility refresh should not spawn the extractor when the file and
    // state are present but simply not newer.
    if (onlyIfNewer && candidates.length) return null;
    if (!onlyIfNewer) return null;
  }

  return runMonetScript();
}

function applyPalette(vars: Record<string, string>, isDark: boolean) {
  const root = document.documentElement;
  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(vars)) {
    if (!key.startsWith('--md-sys-color-') || typeof raw !== 'string') continue;
    // The system exposes ARGB (#AARRGGBB); CSS needs #RRGGBB. Older
    // monet.json payloads may already be 6 digits.
    const val = raw.replace(/^#([0-9a-f]{2})([0-9a-f]{6})$/i, '#$2');
    if (!val) continue;
    clean[key] = val;
    root.style.setProperty(key, val);
  }
  try {
    localStorage.setItem('specter_theme_vars', JSON.stringify(clean));
    localStorage.setItem('specter_theme_resolved', isDark ? 'dark' : 'light');
    if (monetSeed) localStorage.setItem('specter_theme_seed', monetSeed);
  } catch {}
}

function applyMonetData(data: MonetData, mode: string) {
  const resolved = resolveMode(mode);
  const isDark = resolved === 'dark';

  if (data.seed) {
    monetSeed = data.seed;
    try { localStorage.setItem('monet_seed', data.seed); } catch {}
  }
  monetPalette = data.palette || null;
  monetTs = data.ts || Math.floor(Date.now() / 1000);
  try { localStorage.setItem('monet_seed_ts', String(monetTs)); } catch {}

  if (monetPalette) {
    const vars = monetPalette[isDark ? 'dark' : 'light'];
    if (vars && Object.keys(vars).length) {
      try {
        currentMappedPreset = presetClosestTo(
          monetSeed || vars['--md-sys-color-primary'] || '#1157CE'
        );
      } catch {
        currentMappedPreset = 'blue';
      }
      applyPalette(vars, isDark);
      notifyThemeApplied(isDark);
      return;
    }
  }

  if (monetSeed) {
    currentMappedPreset = presetClosestTo(monetSeed);
    applyNamedPreset(currentMappedPreset, isDark);
    return;
  }

  currentMappedPreset = 'blue';
  applyNamedPreset('blue', isDark);
}

async function applyMonetPreset(mode: string, force = false) {
  currentPreset = 'monet';
  const resolved = resolveMode(mode);
  const isDark = resolved === 'dark';

  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-theme-preset', 'monet');
  document.documentElement.setAttribute('data-theme-resolved', resolved);
  cfgSet('theme_preset', 'monet');
  cfgSet('theme_monet_switch', '1');

  const data = await loadMonetData(force);
  if (!data) {
    currentMappedPreset = 'blue';
    applyNamedPreset('blue', isDark);
    return;
  }
  applyMonetData(data, mode);
}

export function refreshTheme() {
  if (currentPreset === 'monet') {
    clearMonetCache();
    applyMonetPreset(document.documentElement.getAttribute('data-theme') || 'dark', true);
  }
}

export function applyMode(mode: string) {
  const resolved = resolveMode(mode);
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-theme-preset', currentPreset);
  document.documentElement.setAttribute('data-theme-resolved', resolved);
  document.documentElement.style.colorScheme = resolved;
  cfgSet('theme', mode);

  if (currentPreset === 'monet') {
    applyMonetPreset(mode);
  } else {
    const name = currentPreset;
    applyNamedPreset(name, resolved === 'dark');
  }
}

export function applyPreset(preset: string) {
  currentPreset = preset;
  cfgSet('theme_preset', preset);
  cfgSet('theme_monet_switch', preset === 'monet' ? '1' : '0');
  if (preset !== 'monet') {
    cfgSet('theme_fixed_preset', preset);
  }
  document.documentElement.setAttribute('data-theme-preset', preset);
  if (preset === 'monet') {
    clearMonetCache();
    applyMonetPreset(document.documentElement.getAttribute('data-theme') || 'dark', true);
    return;
  }
  const isDark = document.documentElement.getAttribute('data-theme-resolved') === 'dark';
  applyNamedPreset(preset, isDark);
}

function applyNamedPreset(name: string, isDark: boolean) {
  const vars = getPresetColors(name, isDark);
  if (!vars) return;
  currentMappedPreset = name;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  try {
    const s = currentPreset === 'monet' ? (monetSeed || PRESETS[name] || '') : (PRESETS[name] || '');
    if (s) {
      localStorage.setItem('specter_theme_vars', JSON.stringify(vars));
      localStorage.setItem('specter_theme_resolved', isDark ? 'dark' : 'light');
      localStorage.setItem('specter_theme_seed', s);
    }
  } catch (e) {}
  notifyThemeApplied(isDark);
}

let themeModeQuery: MediaQueryList | null = null;
let themeModeListener: ((e: MediaQueryListEvent) => void) | null = null;
let visibilityListener: (() => Promise<void>) | null = null;

function wireThemeControls() {
  // Re-wiring replaces the previous listener so repeated initTheme() calls
  // cannot stack system-preference handlers.
  if (themeModeQuery && themeModeListener) {
    themeModeQuery.removeEventListener('change', themeModeListener);
  }
  themeModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeModeListener = (e: MediaQueryListEvent) => {
    const mode = document.documentElement.getAttribute('data-theme');
    if (mode === 'auto') {
      const resolved = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme-resolved', resolved);
      document.documentElement.style.colorScheme = resolved;
      applyMode('auto');
    }
  };
  themeModeQuery.addEventListener('change', themeModeListener);
}

// When user returns to the tab, consume a fresh monet.json (written by the
// background watcher). If it is missing, re-run the extractor once instead
// of silently keeping a stale localStorage seed forever.
function wireVisibilityRefresh() {
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
  }
  visibilityListener = async () => {
    if (document.hidden || currentPreset !== 'monet') return;
    const data = await loadMonetData(false, true);
    if (data) applyMonetData(data, document.documentElement.getAttribute('data-theme') || 'dark');
  };
  document.addEventListener('visibilitychange', visibilityListener);
}
