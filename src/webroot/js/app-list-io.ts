// Shared package discovery, label resolution, and file I/O for the app-list
// pages (App Targeting and HMA-OSS Scope). The two pages use different
// scripts and staging files, but the shell commands and bridge behavior are
// otherwise identical.
import { exec, spawnCommand, getDataDir } from './bridge.js';
import { shellEscape } from './utils.js';
import { ksuGlobal } from './target-apps-icons.js';

export function specterDir(): string {
  return getDataDir() || '/data/adb/specter';
}

export async function shellExec(cmd: string): Promise<{ stdout: string }> {
  try {
    return await exec(cmd);
  } catch {
    return { stdout: '' };
  }
}

export async function fetchUserPackages(): Promise<string[]> {
  const pkgSet = new Set<string>();
  const ksu = ksuGlobal();
  if (typeof ksu?.listUserPackages === 'function') {
    try {
      const list = JSON.parse(ksu.listUserPackages()) as string[];
      for (const p of list) pkgSet.add(p);
    } catch {}
  } else if (typeof ksu?.listPackages === 'function') {
    try {
      const list = JSON.parse(ksu.listPackages('user')) as string[];
      for (const p of list) pkgSet.add(p);
    } catch {}
  }
  if (pkgSet.size > 0) return [...pkgSet];
  // Both cmd and pm emit "package:<name>"; strip the prefix here so the
  // fallback works regardless of which one answered.
  const r = await shellExec('cmd package list packages -3 2>/dev/null || pm list packages -3 2>/dev/null');
  for (const raw of r.stdout.split('\n')) {
    const pkg = raw.trim().replace(/^package:/, '');
    if (pkg) pkgSet.add(pkg);
  }
  return [...pkgSet];
}

export async function resolvePackageNames(packages: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ksu = ksuGlobal();
  if (typeof ksu?.getPackagesInfo === 'function') {
    try {
      const raw = ksu.getPackagesInfo(JSON.stringify(packages));
      const list = JSON.parse(raw) as Array<{ packageName: string; appLabel?: string }>;
      for (let i = 0; i < packages.length && i < list.length; i++) {
        const label = list[i]?.appLabel;
        map.set(packages[i]!, label && label !== packages[i] ? label : packages[i]!);
      }
      for (let i = list.length; i < packages.length; i++) {
        map.set(packages[i]!, packages[i]!);
      }
      return map;
    } catch {}
  }
  for (const pkg of packages) map.set(pkg, pkg);
  return map;
}

export async function fetchSystemPackages(): Promise<string[]> {
  const { stdout } = await shellExec('pm list packages -s 2>/dev/null | cut -d: -f2');
  return stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

export async function cacheAllPackageIcons(size = 48): Promise<void> {
  const ksu = ksuGlobal();
  if (typeof ksu?.cacheAllPackageIcons === 'function') {
    try {
      ksu.cacheAllPackageIcons(size);
    } catch {}
  }
}

export async function stageContent(path: string, content: string, label: string): Promise<void> {
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const written = await spawnCommand(
    `mkdir -p ${specterDir()} && printf '%s' ${shellEscape(b64)} | base64 -d > ${shellEscape(path)}`
  );
  if (written.code !== 0) throw new Error(written.stderr || `failed to stage ${label}`);
}

export async function readBlacklistFile(): Promise<Set<string>> {
  const { stdout } = await shellExec(`cat ${specterDir()}/blacklist.txt 2>/dev/null || echo ""`);
  return new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean));
}
