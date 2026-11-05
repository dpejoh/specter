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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (ttlMs > 0) fetchCache.set(url, { data, expiry: Date.now() + ttlMs });
    return data as T;
  } catch { return null; } finally { clearTimeout(timer); }
}

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, md-switch, md-radio, md-checkbox, md-icon-button, md-fab';

/**
 * Make a click-only row behave like a button for keyboard/AT users.
 * Rows that contain their own interactive control are left alone: nesting a
 * button role around a switch/radio is invalid and creates double activation.
 */
export function makeRowInteractive(el: HTMLElement): boolean {
  if (!el || el.matches('button, a, input, select, textarea')) return false;
  const role = el.getAttribute('role');
  if (role && role !== 'button') return false;
  if (role === 'button') {
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    return true;
  }
  if (el.querySelector(INTERACTIVE_SELECTOR)) return false;
  el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  return true;
}

/** Wire a row/button that loads its module on first activation. Idempotent. */
export function wireLazyClick(id: string, load: () => Promise<unknown>): void {
  const el = document.getElementById(id);
  if (!el || el.dataset.spWired) return;
  el.dataset.spWired = '1';
  makeRowInteractive(el);
  const isSwitchEvent = (e: Event) =>
    e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch');
  el.addEventListener('click', (e) => {
    if (isSwitchEvent(e)) return;
    load().catch(() => {});
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (isSwitchEvent(e)) return;
    e.preventDefault();
    load().catch(() => {});
  });
}

/** Run work after the current frame, when the browser is idle if possible. */
export function afterPaint(fn: () => void, timeoutMs = 1500): void {
  if (typeof window === 'undefined') return;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 200);
  }
}

let _isUpdatingCorners = false;
let _cornerRafId: number | null = null;
let _cornerObserver: MutationObserver | null = null;

export function updateListContainerCorners(root: ParentNode = document) {
  _isUpdatingCorners = true;
  try {
    root.querySelectorAll('.list-container').forEach(container => {
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
