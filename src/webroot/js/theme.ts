import { getPresetColors, presetClosestTo } from './color-utils.js';
import { cfgGet, cfgSet } from './cfg.js';
import { exec } from './bridge.js';

const PRESETS: Record<string, string> = {
  blue:   '#1157CE',
  yellow: '#8F4E06',
  red:    '#B3251E',
  purple: '#7438D2',
  green:  '#006C35',
  orange: '#9A4600',
  pink:   '#B60D6E',
  cyan:   '#00687C',
  grey:   '#5E5E5E',
};

let currentPreset: string = 'blue';
let currentMappedPreset: string = 'blue';
let monetSeed: string | null = null;

export async function initTheme(savedMode: string) {
  currentPreset = await cfgGet('theme_preset', 'monet') || 'monet';
  const mode = savedMode || 'dark';

  if (currentPreset === 'monet') {
    await applyMonetPreset(mode);
  } else {
    applyMode(mode);
  }

  wireThemeControls();

  // When user returns to the tab, re-fetch monet.json (written by background inotifyd)
  if (currentPreset === 'monet') {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || !monetSeed) return;
      const res = await fetch('./json/monet.json?ts=' + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      if (data?.seed && data?.ts && data.ts > (Number(localStorage.getItem('monet_seed_ts')) || 0)) {
        localStorage.setItem('monet_seed', data.seed);
        localStorage.setItem('monet_seed_ts', String(data.ts));
        monetSeed = data.seed;
        applyMonetPreset(document.documentElement.getAttribute('data-theme') || 'dark');
      }
    });
  }
}

export async function initThemeUI() {
  const preset = currentPreset;

  if (customElements.get('md-filter-chip')) {
    document.querySelectorAll('.preset-chip').forEach(chip => {
      (chip as HTMLElement & { selected: boolean }).selected = (chip as HTMLElement).dataset.preset === preset;
    });
  }

  if (customElements.get('md-outlined-segmented-button')) {
    const mode = await cfgGet('theme', 'dark') || 'dark';
    const group = document.getElementById('theme-mode-group');
    if (group) {
      group.querySelectorAll('md-outlined-segmented-button').forEach(btn => {
        (btn as HTMLElement & { selected: boolean }).selected = btn.getAttribute('value') === mode;
      });
    }
  }
}

function resolveMode(mode: string): string {
  if (mode === 'amoled') return 'dark';
  return mode === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
}

async function applyMonetPreset(mode: string) {
  const resolved = resolveMode(mode);
  const isDark = resolved === 'dark';

  if (!monetSeed) {
    monetSeed = await extractMonetColor();
    if (monetSeed) {
      try { localStorage.setItem('monet_seed', monetSeed); } catch (e) {}
    }
  }

  if (!monetSeed) {
    currentMappedPreset = 'blue';
    applyNamedPreset('blue', isDark);
    return;
  }

  currentMappedPreset = presetClosestTo(monetSeed);
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-theme-preset', 'monet');
  document.documentElement.setAttribute('data-theme-resolved', resolved);
  cfgSet('theme_preset', 'monet');
  applyNamedPreset(currentMappedPreset, isDark);
}

export function refreshTheme() {
  if (currentPreset === 'monet') {
    monetSeed = null;
    applyMonetPreset(document.documentElement.getAttribute('data-theme') || 'dark');
  }
}

function applyMode(mode: string) {
  const resolved = resolveMode(mode);
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-theme-resolved', resolved);
  document.documentElement.style.colorScheme = resolved;
  cfgSet('theme', mode);

  const name = currentPreset === 'monet' ? currentMappedPreset : currentPreset;
  applyNamedPreset(name, resolved === 'dark');
}

function applyPreset(preset: string) {
  if (preset === 'monet') {
    document.querySelectorAll('.preset-chip').forEach(chip => {
      (chip as HTMLElement & { selected: boolean }).selected = (chip as HTMLElement).dataset.preset === 'monet';
    });
    monetSeed = null;
    applyMonetPreset(document.documentElement.getAttribute('data-theme') || 'dark');
    return;
  }
  currentPreset = preset;
  document.documentElement.setAttribute('data-theme-preset', preset);
  cfgSet('theme_preset', preset);
  document.querySelectorAll('.preset-chip').forEach(chip => {
    (chip as HTMLElement & { selected: boolean }).selected = (chip as HTMLElement).dataset.preset === preset;
  });
  const isDark = document.documentElement.getAttribute('data-theme-resolved') === 'dark';
  applyNamedPreset(preset, isDark);
}

function applyNamedPreset(name: string, isDark: boolean) {
  const vars = getPresetColors(name, isDark);
  if (!vars) return;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  try {
    const s = PRESETS[name] || '';
    if (s) {
      localStorage.setItem('specter_theme_vars', JSON.stringify(vars));
      localStorage.setItem('specter_theme_resolved', isDark ? 'dark' : 'light');
      localStorage.setItem('specter_theme_seed', s);
    }
  } catch (e) {}
}

async function extractMonetColor(): Promise<string | null> {
  // Consume preloaded monet.json from background inotifyd handler (zero shell exec)
  const preloaded = (window as any).__monetPromise;
  if (preloaded && typeof preloaded?.then === 'function') {
    try {
      const data = await preloaded;
      if (data?.seed && data?.ts) {
        const cachedTs = localStorage.getItem('monet_seed_ts');
        if (!cachedTs || data.ts > Number(cachedTs)) {
          localStorage.setItem('monet_seed', data.seed);
          localStorage.setItem('monet_seed_ts', String(data.ts));
          return data.seed;
        }
      }
    } catch {}
  }

  // Background handler file not available — check localStorage cache
  try {
    const cached = localStorage.getItem('monet_seed');
    const ts = localStorage.getItem('monet_seed_ts');
    if (cached && ts) return cached;
  } catch {}
  try {
    const cmd = [
      `cmd overlay lookup com.android.systemui android:color/system_accent1_500 2>/dev/null`,
      `settings get secure monet_engine_seed 2>/dev/null`,
      `getprop persist.sys.theme.color 2>/dev/null`,
      `dumpsys wallpaper 2>/dev/null | grep -oE '0x[0-9a-fA-F]{8}' | head -1 | tr -d '\\n'`,
    ].join(' || ');

    const result = await exec(cmd);
    const hex = (result.stdout || '').trim();
    if (!hex) return null;

    let argb: number | undefined;
    if (/^0x[0-9a-fA-F]{8}$/.test(hex)) {
      argb = parseInt(hex, 16);
    } else if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
      argb = parseInt(hex.slice(1), 16);
    } else if (/^#?[0-9a-fA-F]{6}$/.test(hex.replace('#', ''))) {
      argb = parseInt(hex.replace('#', ''), 16) | 0xFF000000;
    } else if (/^\d+$/.test(hex) && hex.length > 6) {
      argb = parseInt(hex, 10);
    }

    if (argb && !isNaN(argb)) {
      const seed = '#' + (argb & 0x00FFFFFF).toString(16).padStart(6, '0');
      if (seed !== '#000000') {
        try { localStorage.setItem('monet_seed', seed); localStorage.setItem('monet_seed_ts', String(Date.now())); } catch {}
        return seed;
      }
    }
  } catch (e) {
    console.warn('Failed to extract monet color:', e);
  }
  return null;
}

function wireThemeControls() {
  const modeGroup = document.getElementById('theme-mode-group');
  if (!modeGroup) return;
  modeGroup.addEventListener('segmented-button-set-selection', (e: Event) => {
    const idx = (e as CustomEvent).detail.index;
    const btn = modeGroup.querySelectorAll('md-outlined-segmented-button')[idx];
    if (btn) applyMode(btn.getAttribute('value') || 'dark');
  });

  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', async () => applyPreset((chip as HTMLElement).dataset.preset || ''));
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e: MediaQueryListEvent) => {
    const mode = document.documentElement.getAttribute('data-theme');
    if (mode === 'auto') {
      const resolved = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme-resolved', resolved);
      document.documentElement.style.colorScheme = resolved;
      applyMode('auto');
    }
  });
}
