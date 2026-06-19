import { shellEscape } from './utils.js';
import { EXEC_TIMEOUT_MS } from './constants.js';
import type { ModulePaths, ScriptResult, ExecResult, ChildProcess, PackageInfo } from './types.js';
import { setGlobal, deleteGlobal } from './window-global.js';
import { BridgeError, ScriptError, TimeoutError } from './errors.js';

let MODULE: ModulePaths | null = null;

function registerCallback(name: string, value: unknown): void {
  setGlobal(name, value);
}

function unregisterCallback(name: string): void {
  deleteGlobal(name);
}

/** Initialise the bridge: fetch module paths and set up the environment. Must be called once before any other bridge function. */
export async function initBridge(): Promise<void> {
  try {
    const r = await fetch('/json/module_paths.json');
    MODULE = await r.json() as ModulePaths;
    if (MODULE?.MODDIR) {
      MODULE.MODDIR = MODULE.MODDIR.replace('/modules_update/', '/modules/');
    }
  } catch (e) {
    console.warn('Bridge init parse fallback:', e);
    const src = (document.currentScript as HTMLScriptElement | null)?.src || '';
    const m = src.match(/^(file:\/\/\/data\/adb\/modules\/[^/]+)/);
    const moddir = m ? m[1] : null;
    MODULE = moddir ? { MODDIR: moddir } : null;
  }
  if (!MODULE) throw new BridgeError('NO_MODULE', 'Cannot determine module path');
}

/** Return the detected module install directory, or null if not yet initialised. */
export function getModuleDir(): string | null {
  return MODULE?.MODDIR || null;
}

/** Return the Specter data directory, or null if not yet initialised. */
export function getDataDir(): string | null {
  return MODULE?.SPECTER_DIR || null;
}

function scriptDir(type: string): string {
  const dirs: Record<string, string> = { feature: 'features', common: 'webroot/common' };
  const sub = dirs[type] || 'features';
  const m = MODULE;
  if (!m) return '';
  return `${m.MODDIR}/${sub}/`;
}

function getExecutor(): string | null {
  if (typeof window.ksu?.exec === 'function') return 'ksu';
  return null;
}

/** Resolve app labels for the given packages via the KernelSU native API.
 *  Returns null when the API is unavailable. */
export function getPackagesInfo(packages: string[]): PackageInfo[] | null {
  const fn = (globalThis as any).ksu?.getPackagesInfo;
  if (typeof fn !== 'function') return null;
  try {
    const raw = fn(JSON.stringify(packages));
    return JSON.parse(raw) as PackageInfo[];
  } catch {
    return null;
  }
}

function genCallbackName(): string {
  return `__sp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Run a shell script and collect its result.
 * The script is executed via the KernelSU bridge.
 * @param scriptName - file name of the script (e.g. `device-info.sh`)
 * @param type - script directory: `'feature'` (default) or `'common'`
 * @returns `ScriptResult` with success flag and output
 */
export function runScript(scriptName: string, type = 'feature'): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const executor = getExecutor();
    if (!executor) { reject(new BridgeError('NO_BRIDGE', 'no-bridge')); return; }
    if (!MODULE) { reject(new BridgeError('NO_MODULE', 'no-module-path')); return; }

    const scriptPath = scriptDir(type) + scriptName;
    const globalName = genCallbackName();
    let timer: ReturnType<typeof setTimeout>;

    function cleanup() { clearTimeout(timer); unregisterCallback(globalName); }

    timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError());
    }, EXEC_TIMEOUT_MS);

    registerCallback(globalName, (...args: unknown[]) => {
      cleanup();
      const code = args[0];
      const stdout = args[1];
      if (typeof code === 'number') {
        resolve({ success: code === 0, output: typeof stdout === 'string' ? stdout : '', rawOutput: typeof stdout === 'string' ? stdout : '' });
        return;
      }
      if (typeof code === 'string') {
        const result = parseScriptOutput(code);
        if (result.success) resolve(result);
        else reject(new ScriptError(result));
      } else {
        reject(new BridgeError('UNEXPECTED_CALLBACK', 'unexpected-callback-type'));
      }
    });

    try {
      window.ksu.exec(`sh ${shellEscape(scriptPath)}`, '{}', globalName);
    } catch (err) { cleanup(); reject(err); }
  });
}

/**
 * Execute an arbitrary shell command and return its stdout/stderr.
 * Results are returned as `ExecResult` regardless of exit code.
 */
export function exec(command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const executor = getExecutor();
    if (!executor) { reject(new BridgeError('NO_BRIDGE', 'no-bridge')); return; }
    const globalName = genCallbackName();

    registerCallback(globalName, (...args: unknown[]) => {
      unregisterCallback(globalName);
      const code = args[0];
      const stdout = args[1];
      const stderr = args[2];
      if (typeof code === 'number') {
        resolve({ code, stdout: typeof stdout === 'string' ? stdout : '', stderr: typeof stderr === 'string' ? stderr : '' });
        return;
      }
      if (typeof code !== 'string') {
        resolve({ stdout: '', stderr: '' });
        return;
      }
      if (!code) { resolve({ stdout: '', stderr: '' }); return; }
      try {
        const json = JSON.parse(code);
        resolve({
          stdout: json.result || json.stdout || json.output || '',
          stderr: json.stderr || json.error || '',
        });
      } catch (e) {
        console.warn('Exec JSON parse fallback:', e);
        resolve({ stdout: code, stderr: '' });
      }
    });

    try {
      window.ksu.exec(command, '{}', globalName);
    } catch (e) { unregisterCallback(globalName); reject(e); }
  });
}

function createChildProcess(): ChildProcess {
  const cbs: Record<string, Function[]> = { stdout: [], stderr: [], stdin: [], exit: [], error: [] };
  const getCbs = (k: string) => cbs[k]!;
  const child: ChildProcess = {
    stdout: {
      on(ev: 'data', fn: (data: string) => void) { if (ev === 'data') getCbs('stdout').push(fn); },
      emit(ev: 'data', data: string) { if (ev === 'data') getCbs('stdout').forEach(fn => fn(data)); },
    },
    stderr: {
      on(ev: 'data', fn: (data: string) => void) { if (ev === 'data') getCbs('stderr').push(fn); },
      emit(ev: 'data', data: string) { if (ev === 'data') getCbs('stderr').forEach(fn => fn(data)); },
    },
    stdin: { on() {}, emit() {} },
    on(ev: string, fn: Function) { const a = getCbs(ev); if (a) a.push(fn); },
    emit(ev: string, ...args: unknown[]) { const a = getCbs(ev); if (a) a.forEach(fn => fn(...args)); },
  };
  return child;
}

/**
 * Spawn a script and return a `ChildProcess` that emits stdout/stderr lines
 * and an exit/error event.  Falls back to polling `exec` when `ksu.spawn`
 * is unavailable.
 */
export function spawnScript(scriptName: string, type = 'feature'): ChildProcess {
  const executor = getExecutor();
  const child = createChildProcess();
  if (!executor) { setTimeout(() => child.emit('error', new BridgeError('NO_BRIDGE', 'no-bridge'))); return child; }
  if (!MODULE) { setTimeout(() => child.emit('error', new BridgeError('NO_MODULE', 'no-module-path'))); return child; }

  const scriptPath = scriptDir(type) + scriptName;

  if (executor === 'ksu' && typeof window.ksu?.spawn === 'function') {
    const globalName = genCallbackName();
    registerCallback(globalName, child);
    child.on('exit', () => unregisterCallback(globalName));
    child.on('error', () => unregisterCallback(globalName));
    try {
      window.ksu.spawn('sh', JSON.stringify([scriptPath]), '{}', globalName);
    } catch (e) { unregisterCallback(globalName); setTimeout(() => child.emit('error', e)); }
  } else {
    const cmd = `sh ${shellEscape(scriptPath)}`;
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; child.emit('error', new Error('timeout')); }, EXEC_TIMEOUT_MS);
    exec(cmd).then(({ code, stdout, stderr }) => {
      if (timedOut) return;
      clearTimeout(t);
      if (stdout) stdout.split('\n').forEach(l => l && child.stdout.emit('data', l));
      if (stderr) stderr.split('\n').forEach(l => l && child.stderr.emit('data', l));
      if (typeof code === 'number') child.emit('exit', code);
    }).catch(e => { if (!timedOut) { clearTimeout(t); child.emit('error', e); } });
  }
  return child;
}

function parseScriptOutput(raw: string): ScriptResult {
  if (!raw) return { success: true, rawOutput: '' };
  try {
    const json = JSON.parse(raw);
    return {
      success: json.success !== false,
      output: json.result || json.stdout || json.output || '',
      rawOutput: raw,
    };
  } catch (e) {
    console.warn('Script output parse fallback:', e);
    const lower = raw.toLowerCase();
    const errorKeywords = ['not found', 'failed', 'error', 'permission denied', 'no such file'];
    const hasError = errorKeywords.some(kw => lower.includes(kw));
    return { success: !hasError, rawOutput: raw };
  }
}
