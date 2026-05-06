import { exec as bridgeExec } from './bridge.js';
import { shellEscape } from './utils.js';

let MODULE: string | null = null;
const cache: Record<string, string | undefined | null> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlush: Array<{ key: string; val: string | undefined | null }> = [];

export function setModuleDir(path: string) { MODULE = path; }

async function readConfig(key: string): Promise<string | null> {
  if (!MODULE) return null;
  const result = await bridgeExec(
    `ksud module config get ${shellEscape(key)} 2>/dev/null || cat ${shellEscape(MODULE + '/config/' + key + '.val')} 2>/dev/null || true`
  );
  return ((result as any).stdout || '').trim() || null;
}

function writeConfig(key: string, val: string | undefined | null) {
  if (!MODULE) return Promise.resolve();
  const cmd =
    `ksud module config set ${shellEscape(key)} ${shellEscape(val || '')} 2>/dev/null || ` +
    `mkdir -p ${shellEscape(MODULE + '/config')} && printf '%s' ${shellEscape(val || '')} > ${shellEscape(MODULE + '/config/' + key + '.val')}`;
  return bridgeExec(cmd).catch((err: any) => console.warn('Config write failed for', key, err));
}

export async function cfgGet(key: string, defaultValue?: string): Promise<string | undefined | null> {
  if (key in cache) return cache[key];
  const val = await readConfig(key);
  cache[key] = val ?? defaultValue;
  return cache[key];
}

export function cfgSet(key: string, val: string | undefined | null) {
  cache[key] = val;
  pendingFlush.push({ key, val });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = pendingFlush;
    pendingFlush = [];
    for (const { key: k, val: v } of batch) {
      writeConfig(k, v);
    }
  }, 500);
}

export async function cfgFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const batch = pendingFlush;
  pendingFlush = [];
  await Promise.all(batch.map(({ key, val }) => writeConfig(key, val)));
}

window.addEventListener('beforeunload', () => {
  cfgFlush();
});

export async function migrateLocalStorage() {
  try {
    if (localStorage.getItem('_cfg_migrated')) return;
    const map: Record<string, string> = {
      selectedLanguage: 'lang',
      themeMode: 'theme',
      themePreset: 'theme_preset',
    };
    for (const [oldKey, newKey] of Object.entries(map)) {
      const val = localStorage.getItem(oldKey);
      if (val) {
        cache[newKey] = val;
        writeConfig(newKey, val);
      }
    }
    localStorage.removeItem('themeMode');
    localStorage.removeItem('themePreset');
    localStorage.removeItem('clockFormat');
    localStorage.setItem('_cfg_migrated', '1');
  } catch (e) {
    console.warn('Migration failed:', e);
  }
}
