// Pure model for the two app-list pages. No DOM, no bridge calls: this module
// owns list shapes, filtering/sorting, target suffix parsing, and the state
// cycle helpers so the page controllers do not each reimplement them.
import { getTranslation } from './i18n.js';

export type AppMode = 'primary' | 'blacklist';
export type TargetState = 'unchecked' | 'bare' | 'conditional' | 'force';
export type HmaScopeState = 'unchecked' | 'targeted';
export type TargetAppState = TargetState | 'blacklisted';
export type HmaAppState = HmaScopeState | 'blacklisted';

export interface AppLabel {
  key: string;
  fallback: string;
}

export interface AppListEntry<S extends string = string> {
  packageName: string;
  appName: string;
  state: S;
}

export type TargetApp = AppListEntry<TargetAppState>;
export type HmaApp = AppListEntry<HmaAppState>;

export interface StateVisual {
  icon?: string;
  text?: string;
  labelKey: string;
  labelFallback: string;
}

export interface AppFilterState {
  search: string;
  selection: 'all' | 'selected' | 'not_selected';
  mode: AppMode;
  showSystemApps: boolean;
  systemPackages: readonly string[];
  modeFilter: string | null;
}

export const BLACKLIST_VISUALS: Record<string, StateVisual> = {
  unchecked: {
    icon: '',
    text: '',
    labelKey: 'bl_state_not_blacklisted',
    labelFallback: 'Not blacklisted',
  },
  blacklisted: {
    icon: 'block',
    text: '',
    labelKey: 'bl_state_blacklisted',
    labelFallback: 'Blacklisted',
  },
};

export function translateLabel(label: AppLabel): string {
  return getTranslation(label.key) || label.fallback;
}

export function filterAndSortApps<S extends string>(
  apps: readonly AppListEntry<S>[],
  filters: AppFilterState,
): AppListEntry<S>[] {
  let result = [...apps];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(a =>
      a.packageName.toLowerCase().includes(q) || a.appName.toLowerCase().includes(q)
    );
  }

  if (!filters.showSystemApps && filters.systemPackages.length) {
    const sysSet = new Set(filters.systemPackages);
    result = result.filter(a => !sysSet.has(a.packageName) || a.state !== 'unchecked');
  }

  if (filters.selection === 'selected') {
    result = result.filter(a => filters.mode === 'blacklist'
      ? a.state === 'blacklisted'
      : a.state !== 'unchecked');
  } else if (filters.selection === 'not_selected') {
    result = result.filter(a => a.state === 'unchecked');
  }

  if (filters.mode === 'primary' && filters.modeFilter) {
    result = result.filter(a => a.state === filters.modeFilter);
  }

  result.sort((a, b) => {
    const aSelected = a.state !== 'unchecked' ? 0 : 1;
    const bSelected = b.state !== 'unchecked' ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    return a.appName.localeCompare(b.appName);
  });

  return result;
}

export function nextCyclic<T>(order: readonly T[], current: T): T | undefined {
  if (order.length === 0) return undefined;
  const index = order.indexOf(current);
  return order[(index + 1) % order.length];
}

export function parseSuffixedList(
  raw: string,
  allowPerAppModes: boolean,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
    if (allowPerAppModes && line.endsWith('!')) {
      map.set(line.slice(0, -1), 'force');
    } else if (allowPerAppModes && line.endsWith('?')) {
      map.set(line.slice(0, -1), 'conditional');
    } else {
      map.set(line.replace(/[!?]$/, ''), 'bare');
    }
  }
  return map;
}

export function serializeSuffixedSelection(
  apps: readonly AppListEntry[],
  allowPerAppModes: boolean,
): string {
  return apps
    .filter(a => a.state !== 'unchecked')
    .map(a => {
      if (allowPerAppModes && a.state === 'force') return a.packageName + '!';
      if (allowPerAppModes && a.state === 'conditional') return a.packageName + '?';
      return a.packageName;
    })
    .sort()
    .join('\n');
}

export function parsePlainList(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
    map.set(line, 'targeted');
  }
  return map;
}

export function serializePlainSelection(
  apps: readonly AppListEntry[],
  selectedState: string,
): string {
  return apps
    .filter(a => a.state === selectedState)
    .map(a => a.packageName)
    .sort()
    .join('\n');
}

export function pruneBlacklistedLines(
  raw: string,
  blacklisted: ReadonlySet<string>,
  linePackage: (line: string) => string,
): { content: string; removed: number } {
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const kept = lines.filter(line => !blacklisted.has(linePackage(line)));
  return { content: kept.join('\n'), removed: lines.length - kept.length };
}
