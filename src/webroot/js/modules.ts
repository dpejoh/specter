import { exec, getModuleDir } from './bridge.js';
import { shellEscape } from './utils.js';

/** True when any KernelSU/Magisk module in the list is installed or staged. */
export async function isAnyModuleInstalled(moduleIds: readonly string[]): Promise<boolean> {
  if (moduleIds.length === 0) return false;
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
