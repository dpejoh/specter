import { shellEscape, setGlobal, deleteGlobal, BridgeError, TimeoutError, ScriptError } from './utils.js';
import { EXEC_TIMEOUT_MS } from './constants.js';
import type { ModulePaths, ScriptResult, ExecResult, PackageInfo, ChildProcess } from './types.js';

let MODULE: ModulePaths | null = null;

export async function initBridge(): Promise<void> {
  const preloaded = (window as any).__modulePathsPromise;
  if (preloaded && typeof preloaded?.then === 'function') {
    try {
      const data = await preloaded;
      if (data?.MODDIR) {
        data.MODDIR = data.MODDIR.replace('/modules_update/', '/modules/');
        MODULE = data;
        return;
      }
    } catch {}
  }
  try {
    const r = await fetch('/json/module_paths.json');
    MODULE = await r.json() as ModulePaths;
    if (MODULE?.MODDIR) MODULE.MODDIR = MODULE.MODDIR.replace('/modules_update/', '/modules/');
  } catch {
    const m = (document.currentScript as HTMLScriptElement | null)?.src?.match(/^(file:\/\/\/data\/adb\/modules\/[^/]+)/);
    MODULE = m ? { MODDIR: m[1] } as ModulePaths : null;
  }
  if (!MODULE) throw new BridgeError('NO_MODULE', 'Cannot determine module path');
}

export function getModuleDir(): string | null { return MODULE?.MODDIR || null; }
export function getDataDir(): string | null { return MODULE?.SPECTER_DIR || null; }

function scriptDir(type: string): string {
  const dirs: Record<string, string> = { feature: 'features', common: 'webroot/common' };
  return MODULE ? `${MODULE.MODDIR}/${dirs[type] || 'features'}/` : '';
}

export function getPackagesInfo(packages: string[]): PackageInfo[] | null {
  const fn = (globalThis as any).ksu?.getPackagesInfo;
  if (typeof fn !== 'function') return null;
  try { return JSON.parse(fn(JSON.stringify(packages))) as PackageInfo[]; } catch { return null; }
}

function genCallbackName(): string { return `__sp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

export function runScript(scriptName: string, type = 'feature'): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    if (!window.ksu?.exec) { reject(new BridgeError('NO_BRIDGE', 'no-bridge')); return; }
    if (!MODULE) { reject(new BridgeError('NO_MODULE', 'no-module-path')); return; }

    const globalName = genCallbackName();
    const timer = setTimeout(() => { deleteGlobal(globalName); reject(new TimeoutError()); }, EXEC_TIMEOUT_MS);

    setGlobal(globalName, (code: unknown, stdout: unknown) => {
      clearTimeout(timer); deleteGlobal(globalName);
      if (typeof code === 'number') {
        resolve({ success: code === 0, output: typeof stdout === 'string' ? stdout : '', rawOutput: typeof stdout === 'string' ? stdout : '' });
      } else if (typeof code === 'string' && code) {
        try {
          const json = JSON.parse(code);
          if (json.success !== false) {
            resolve({ success: true, output: json.result || json.stdout || json.output || '', rawOutput: code });
          } else {
            reject(new ScriptError({ success: false, output: json.stdout || json.result || '', rawOutput: code }));
          }
        } catch {
          resolve({ success: false, output: code, rawOutput: code });
        }
      } else {
        resolve({ success: false, output: '', rawOutput: String(code || '') });
      }
    });

    try { window.ksu.exec(`sh ${shellEscape(scriptDir(type) + scriptName)}`, '{}', globalName); }
    catch (e) { clearTimeout(timer); deleteGlobal(globalName); reject(e); }
  });
}

export function exec(command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (!window.ksu?.exec) { reject(new BridgeError('NO_BRIDGE', 'no-bridge')); return; }

    const globalName = genCallbackName();
    const timer = setTimeout(() => { deleteGlobal(globalName); reject(new TimeoutError()); }, EXEC_TIMEOUT_MS);

    setGlobal(globalName, (code: unknown, stdout: unknown, stderr: unknown) => {
      clearTimeout(timer); deleteGlobal(globalName);
      if (typeof code === 'number') {
        resolve({ code, stdout: typeof stdout === 'string' ? stdout : '', stderr: typeof stderr === 'string' ? stderr : '' });
      } else if (typeof code === 'string' && code) {
        try {
          const json = JSON.parse(code);
          resolve({
            code: typeof json.code === 'number' ? json.code : json.success !== false ? 0 : 1,
            stdout: json.result || json.stdout || json.output || '',
            stderr: json.stderr || json.error || '',
          });
        } catch {
          resolve({ code: -1, stdout: code, stderr: '' });
        }
      } else {
        resolve({ code: -1, stdout: '', stderr: '' });
      }
    });

    try { window.ksu.exec(command, '{}', globalName); }
    catch (e) { clearTimeout(timer); deleteGlobal(globalName); reject(e); }
  });
}

function createChildProcess(): ChildProcess {
  const cbs: Record<string, Function[]> = { stdout: [], stderr: [], exit: [], error: [] };
  const getCbs = (k: string) => cbs[k]!;
  return {
    stdout: {
      on(ev: 'data', fn: (data: string) => void) { if (ev === 'data') getCbs('stdout').push(fn); },
      emit(ev: 'data', data: string) { if (ev === 'data') getCbs('stdout').forEach(fn => fn(data)); },
    },
    stderr: {
      on(ev: 'data', fn: (data: string) => void) { if (ev === 'data') getCbs('stderr').push(fn); },
      emit(ev: 'data', data: string) { if (ev === 'data') getCbs('stderr').forEach(fn => fn(data)); },
    },
    on(ev: string, fn: Function) { const a = getCbs(ev); if (a) a.push(fn); },
    emit(ev: string, ...args: unknown[]) { const a = getCbs(ev); if (a) a.forEach(fn => fn(...args)); },
  };
}

export function spawnScript(scriptName: string, type = 'feature'): ChildProcess {
  const child = createChildProcess();
  if (!window.ksu?.exec) { setTimeout(() => (child as any).emit('error', new BridgeError('NO_BRIDGE', 'no-bridge'))); return child; }
  if (!MODULE) { setTimeout(() => (child as any).emit('error', new BridgeError('NO_MODULE', 'no-module-path'))); return child; }

  const scriptPath = scriptDir(type) + scriptName;

  if (typeof window.ksu?.spawn === 'function') {
    const globalName = genCallbackName();
    setGlobal(globalName, child);
    const cleanup = () => deleteGlobal(globalName);
    const timer = setTimeout(cleanup, EXEC_TIMEOUT_MS);
    (child as any).on('exit', () => { clearTimeout(timer); cleanup(); });
    (child as any).on('error', () => { clearTimeout(timer); cleanup(); });
    try { window.ksu.spawn('sh', JSON.stringify([scriptPath]), '{}', globalName); }
    catch (e) { clearTimeout(timer); cleanup(); setTimeout(() => (child as any).emit('error', e)); }
  } else {
    const cmd = `sh ${shellEscape(scriptPath)}`;
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; (child as any).emit('error', new TimeoutError()); }, EXEC_TIMEOUT_MS);
    exec(cmd).then(({ code, stdout, stderr }) => {
      if (timedOut) return;
      clearTimeout(t);
      if (stdout) stdout.split('\n').forEach(l => l && (child as any).stdout.emit('data', l));
      if (stderr) stderr.split('\n').forEach(l => l && (child as any).stderr.emit('data', l));
      if (typeof code === 'number') (child as any).emit('exit', code);
    }).catch(e => { if (!timedOut) { clearTimeout(t); (child as any).emit('error', e); } });
  }
  return child;
}
