import { exec, getModuleDir } from './bridge.js';
import { shellEscape } from './utils.js';
import type { ModulesStateJson } from './types.js';

/**
 * Installed modules and conflict ownership from the background snapshot.
 * The scheduler rebuilds state.json when a module.prop mtime changes, so the
 * UI can answer these questions without a blocking shell call.
 */
export function getModulesSnapshot(): Promise<ModulesStateJson | null> {
  const preloaded = (window as { __modulesPromise?: Promise<ModulesStateJson | null> }).__modulesPromise;
  if (!preloaded || typeof preloaded.then !== 'function') return Promise.resolve(null);
  return preloaded.catch(() => null);
}

/** True when any KernelSU/Magisk module in the list is installed or staged. */
export async function isAnyModuleInstalled(moduleIds: readonly string[]): Promise<boolean> {
  if (moduleIds.length === 0) return false;

  const snapshot = await getModulesSnapshot();
  if (snapshot?.modules) {
    return moduleIds.some(id => snapshot.modules[id] === true);
  }

  // Compatibility fallback for an older snapshot or a missing state file.
  const moduleDir = getModuleDir()?.replace(/\/+$/, '');
  const base = moduleDir ? moduleDir.replace(/\/[^/]+$/, '') : '/data/adb/modules';
  const checks = moduleIds.flatMap(id => [
    `${base}/${id}/module.prop`,
    `${base}_update/${id}/module.prop`,
  ]);
  const command = checks.map(path => `test -f ${shellEscape(path)}`).join(' || ');
  try {
    const { code } = await exec(command);
    return code === 0;
  } catch {
    return false;
  }
}

/** True when a KernelSU/Magisk module with this id is installed or staged. */
export function isModuleInstalled(moduleId: string): Promise<boolean> {
  return isAnyModuleInstalled([moduleId]);
}
