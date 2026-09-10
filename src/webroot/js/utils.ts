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

let _isUpdatingCorners = false;
let _cornerRafId: number | null = null;
let _cornerObserver: MutationObserver | null = null;

export function updateListContainerCorners(root: ParentNode = document) {
  _isUpdatingCorners = true;
  try {
    root.querySelectorAll('.list-container:not(.list-container--keybox)').forEach(container => {
      const items = Array.from(container.querySelectorAll<HTMLElement>(':scope > .list-item'));
      const visible = items.filter(el => !el.hidden && !el.classList.contains('hidden') && el.style.display !== 'none');

      items.forEach(el => {
        el.classList.remove('list-item--first', 'list-item--middle', 'list-item--last', 'list-item--only');
      });

      if (visible.length === 1 && visible[0]) {
        visible[0].classList.add('list-item--only');
      } else if (visible.length > 1) {
        visible.forEach((el, idx) => {
          if (idx === 0) el.classList.add('list-item--first');
          else if (idx === visible.length - 1) el.classList.add('list-item--last');
          else el.classList.add('list-item--middle');
        });
      }
    });
  } finally {
    Promise.resolve().then(() => {
      _isUpdatingCorners = false;
    });
  }
}

export function scheduleCornerUpdate() {
  if (_cornerRafId !== null) return;
  _cornerRafId = requestAnimationFrame(() => {
    _cornerRafId = null;
    updateListContainerCorners();
  });
}

export function initCornerObserver() {
  if (_cornerObserver || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  _cornerObserver = new MutationObserver((mutations) => {
    if (_isUpdatingCorners) return;
    let shouldUpdate = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        const target = m.target as HTMLElement;
        if (target.classList?.contains('list-container') || target.closest?.('.list-container')) {
          shouldUpdate = true;
          break;
        }
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i] as HTMLElement;
          if (node.nodeType === Node.ELEMENT_NODE && (node.classList?.contains('list-item') || node.querySelector?.('.list-item'))) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) break;
      } else if (m.type === 'attributes') {
        const target = m.target as HTMLElement;
        if (target.nodeType !== Node.ELEMENT_NODE) continue;
        if (m.attributeName === 'class') {
          const oldVal = m.oldValue || '';
          const newVal = target.className || '';
          const sanitize = (c: string) => c.replace(/\blist-item--(first|middle|last|only)\b/g, '').replace(/\s+/g, ' ').trim();
          if (sanitize(oldVal) === sanitize(newVal)) {
            continue;
          }
        }
        if (
          target.classList?.contains('list-item') ||
          target.classList?.contains('list-container') ||
          target.closest?.('.list-container')
        ) {
          shouldUpdate = true;
          break;
        }
      }
    }
    if (shouldUpdate) {
      scheduleCornerUpdate();
    }
  });

  const body = document.body || document.documentElement;
  if (body) {
    _cornerObserver.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class'],
      attributeOldValue: true,
    });
  }
}
