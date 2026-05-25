import { exec as bridgeExec } from './bridge.js';
import { shellEscape } from './utils.js';

let MODULE: string | null = null;
const cache: Record<string, string | undefined | null> = {};

export function setModuleDir(path: string) { MODULE = path; }

export async function cfgInit() {
  if (!MODULE) return;
  const cfgDir = shellEscape(MODULE + '/config');
  const cmd = `for f in ${cfgDir}/*.val; do [ -f "\$f" ] || continue; k="\${f##*/}"; k="\${k%.val}"; v="\$(cat "\$f")"; [ -n "\$v" ] || continue; printf 'CFG:%s\n' "\$k"; printf '%s\n' "\$v"; done`;
  const result = await bridgeExec(cmd);
  const stdout = ((result as any).stdout || '').trim();
  if (!stdout) return;
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('CFG:')) continue;
    const key = lines[i].slice(4);
    const value = lines[++i] || '';
    cache[key] = value;
  }
}

async function readConfig(key: string): Promise<string | null> {
  if (!MODULE) return null;
  const result = await bridgeExec(
    `cat ${shellEscape(MODULE + '/config/' + key + '.val')} 2>/dev/null || true`
  );
  return ((result as any).stdout || '').trim() || null;
}

function writeConfig(key: string, val: string | undefined | null) {
  if (!MODULE) return Promise.resolve();
  const cmd =
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
  writeConfig(key, val);
}

export function cfgInvalidate(key?: string) {
  if (key) {
    delete cache[key];
  } else {
    for (const k of Object.keys(cache)) delete cache[k];
  }
}

export async function cfgFlush() {
}

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
