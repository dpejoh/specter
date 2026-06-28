import { getTranslation } from './i18n.js';

// -- Error classes --
export class SpecterError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message); this.name = 'SpecterError'; this.code = code
  }
}
export class BridgeError extends SpecterError { constructor(code: string, message: string) { super(code, message); this.name = 'BridgeError' } }
export class ScriptError extends BridgeError {
  readonly result?: { success: boolean; output?: string; rawOutput: string }
  constructor(result: { success: boolean; output?: string; rawOutput: string }) {
    super('SCRIPT_ERROR', getTranslation('error_script_failed') || 'Script execution failed'); this.name = 'ScriptError'; this.result = result
  }
}
export class TimeoutError extends BridgeError { constructor() { super('TIMEOUT', getTranslation('error_operation_timed_out') || 'Operation timed out'); this.name = 'TimeoutError' } }
export class ConfigError extends SpecterError { constructor(message: string) { super('CONFIG_ERROR', message); this.name = 'ConfigError' } }

// -- Global state --
const _friendlyNames: Record<string, string> = {};
let _devMode = false;
export function setFriendlyNames(names: Record<string, string>) { Object.assign(_friendlyNames, names); }
export function getFriendlyNames(): Record<string, string> { return _friendlyNames; }
export function getFriendlyName(key: string): string { return _friendlyNames[key] || key; }
export function isDevMode(): boolean { return _devMode; }
export function setDevMode(v: boolean) { _devMode = v; }

// -- Window globals --
const _W = window as unknown as Record<string, unknown>;
export function getGlobal<T = unknown>(key: string): T | undefined { return _W[key] as T | undefined; }
export function setGlobal(key: string, value: unknown): void { _W[key] = value; }
export function deleteGlobal(key: string): void { delete _W[key]; }

// -- Utilities --
const fetchCache = new Map<string, { data: unknown; expiry: number }>();

export function escapeHtml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function shellEscape(str: string): string {
  return "'" + String(str).replace(/'/g, `'"'"'`) + "'";
}

export async function fetchJson<T>(url: string, ttlMs = 0): Promise<T | null> {
  if (ttlMs > 0) {
    const cached = fetchCache.get(url);
    if (cached && cached.expiry > Date.now()) return cached.data as T;
  }
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (ttlMs > 0) fetchCache.set(url, { data, expiry: Date.now() + ttlMs });
    return data as T;
  } catch { return null; }
}

export function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
