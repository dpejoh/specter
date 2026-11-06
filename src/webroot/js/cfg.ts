import { exec as bridgeExec } from './bridge.js';
import { shellEscape } from './utils.js';

let DATA_DIR: string | null = null;
const cache: Record<string, string | undefined | null> = {};
let snapshotComplete = false;

/** Set the Specter data directory for config file access. */
export function setDataDir(path: string) { DATA_DIR = path; }

/** Pre-populate the config cache from the module's state snapshot or disk. */
export async function cfgInit() {
  // state.json arrives as one async fetch instead of a blocking shell call.
  let stateConfig: Record<string, string | null> | null = null;
  let stateConfigTs = 0;
  try {
    const state = await (window as any).__statePromise;
    if (state && state.config && typeof state.config === 'object' && Object.keys(state.config).length > 0) {
      stateConfig = state.config as Record<string, string | null>;
      stateConfigTs = Number(state.config_ts) || 0;
    }
  } catch {}

  if (stateConfig) {
    snapshotComplete = true;
    for (const [key, val] of Object.entries(stateConfig)) {
      cache[key] = typeof val === 'string' ? val : undefined;
    }
  }

  // Local values win only when they are newer than the state snapshot.
  const localTs = Number(localStorage.getItem('sp_cfg_ts')) || 0;
  const useLocal = !stateConfig || localTs > stateConfigTs * 1000;
  if (useLocal) {
    const preloaded = (window as any).__preloadedCfg;
    if (preloaded && typeof preloaded === 'object' && Object.keys(preloaded).length > 0) {
      const entries = Object.entries(preloaded);
      for (const [key, val] of entries) {
        if (typeof val === 'string') cache[key] = val;
      }
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('sp_cfg_') && k !== 'sp_cfg_ts') {
              cache[k.slice(7)] = localStorage.getItem(k);
            }
          }
        }
      } catch {}
    }
  }

  if (stateConfig || !DATA_DIR) {
    return;
  }

  // Fallback for first boot. The `read` builtin avoids one `cat` per file.
  const cfgDir = shellEscape(DATA_DIR + '/config/val');
  const cmd = `for f in ${cfgDir}/*.val; do [ -f "\$f" ] || continue; k="\${f##*/}"; k="\${k%.val}"; v=''; IFS= read -r v < "\$f" || true; printf 'CFG:%s\n' "\$k"; printf '%s\n' "\$v"; done`;
  const result = await bridgeExec(cmd);
  const stdout = (result.stdout || '').trim();
  if (!stdout) return;
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.startsWith('CFG:')) continue;
    const key = line.slice(4);
    const next = lines[i + 1];
    cache[key] = next ? next : undefined;
    i++;
  }
  snapshotComplete = true;
}

async function readConfig(key: string): Promise<string | null> {
  if (!DATA_DIR) return null;
  const result = await bridgeExec(
    `cat ${shellEscape(DATA_DIR + '/config/val/' + key + '.val')} 2>/dev/null || true`
  );
  return (result.stdout || '').trim() || null;
}

function writeConfig(key: string, val: string | undefined | null) {
  if (!DATA_DIR) return Promise.resolve();
  const cmd =
    `mkdir -p ${shellEscape(DATA_DIR + '/config/val')} && printf '%s' ${shellEscape(val || '')} > ${shellEscape(DATA_DIR + '/config/val/' + key + '.val')}`;
  return bridgeExec(cmd)
    .then(() => undefined)
    .catch((err: unknown) => { console.warn('Config write failed for', key, err); });
}

/** Retrieve a config value by key. Checks the in-memory cache first, then reads from disk. Returns the stored value, `defaultValue`, or `null`. */
export async function cfgGet(key: string, defaultValue?: string): Promise<string | undefined | null> {
  if (key in cache) return cache[key] ?? defaultValue;
  // A complete snapshot already covers every existing .val file.
  if (snapshotComplete) return defaultValue;
  const val = await readConfig(key);
  cache[key] = val;
  return cache[key] ?? defaultValue;
}

const writeChains = new Map<string, Promise<void>>();

/** Serialize disk writes per key so rapid toggles cannot land out of order. */
function enqueueWrite(key: string, val: string | undefined | null): Promise<void> {
  const previous = writeChains.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => writeConfig(key, val))
    .catch((err: unknown) => console.warn('Config write failed for', key, err));
  writeChains.set(key, next);
  void next.finally(() => {
    if (writeChains.get(key) === next) writeChains.delete(key);
  });
  return next;
}

/** Set a config value both in cache and on disk. No-op when the value is unchanged. */
export function cfgSet(key: string, val: string | undefined | null): Promise<void> {
  if (key in cache && cache[key] === val) return Promise.resolve();
  cache[key] = val;
  try {
    localStorage.setItem('sp_cfg_' + key, val ?? '');
    localStorage.setItem('sp_cfg_ts', String(Date.now()));
  } catch {}
  return enqueueWrite(key, val);
}

/** Remove one key (or all keys when called without argument) from the in-memory cache. */
export function cfgInvalidate(key?: string) {
  snapshotComplete = false;
  if (key) {
    delete cache[key];
  } else {
    for (const k of Object.keys(cache)) delete cache[k];
  }
}

/** Migrate legacy localStorage keys (`selectedLanguage`, `themeMode`, `themePreset`) to the new config system. Idempotent — only runs once. */
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
