import { afterPaint, fetchJson } from './utils.js';
import { runScript, spawnScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import { getTranslation, t } from './i18n.js';
import { getModulesSnapshot } from './modules.js';
import { showToast } from './toast.js';
import type { ConflictModule, InfoJson, KeyboxInfoJson, KeystoreManagerJson } from './types.js';

const HERO_CLIP = 'hero-clip';
const HERO_CLIP_OPEN = 'hero-clip--open';

function bindHeroClip(el: HTMLElement) {
  if (el.dataset.heroClip) return;
  el.dataset.heroClip = '1';
  el.addEventListener('click', () => {
    if (!el.classList.contains(HERO_CLIP)) return;
    const open = !el.classList.contains(HERO_CLIP_OPEN);
    el.classList.toggle(HERO_CLIP_OPEN, open);
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  el.addEventListener('keydown', (e) => {
    if (!el.classList.contains(HERO_CLIP)) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat) return;
    e.preventDefault();
    el.click();
  });
}

function syncHeroClip(el: HTMLElement) {
  bindHeroClip(el);
  const wasOpen = el.classList.contains(HERO_CLIP_OPEN);
  el.classList.remove(HERO_CLIP_OPEN);
  const clipped = el.scrollWidth > el.clientWidth;
  const open = clipped && wasOpen;
  el.classList.toggle(HERO_CLIP, clipped);
  el.classList.toggle(HERO_CLIP_OPEN, open);
  if (clipped) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
  } else {
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-expanded');
  }
}

function setClipped(el: HTMLElement, text: string) {
  el.textContent = text;
  if (text) el.title = text;
  else el.removeAttribute('title');
  syncHeroClip(el);
}

export async function initDevice() {
  wireKeyboxRefreshButton();
  await Promise.all([refreshDevice(), refreshKeyboxStatus(), refreshKeystoreManager()]);
}

export function wireKeyboxRefreshButton() {
  const btn = document.getElementById('kb-refresh-btn');
  if (!btn || btn.dataset.spWired) return;
  btn.dataset.spWired = '1';
  btn.addEventListener('click', async () => {
    btn.setAttribute('disabled', '');
    btn.classList.add('kb-refresh-btn--busy');
    // Paint the busy state before the bridge call. spawn() keeps the main
    // thread free, but the exec fallback runs synchronously and would hide it.
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      await recomputeKeyboxStatus();
    } catch (e) {
      console.warn('Keybox refresh failed:', e);
      showToast(getTranslation('toast_failed_update') || 'Failed to update', {
        icon: 'error', type: 'error', autoCloseDelay: 3000,
      });
    } finally {
      btn.removeAttribute('disabled');
      btn.classList.remove('kb-refresh-btn--busy');
    }
  });
}

export async function refreshDevice(refreshFromScript = false): Promise<InfoJson | null> {
  // Use the boot snapshot; refresh explicitly on later Home visits.
  const preloaded = (window as any).__infoPromise;
  const data: InfoJson | null = preloaded && typeof preloaded?.then === 'function'
    ? await preloaded
    : await fetchJson<InfoJson>(API_URLS.INFO!);
  if (data) {
    applyAllDeviceInfo(data);
    if (refreshFromScript) afterPaint(() => { refreshDeviceFromScript().catch(() => {}); });
    return data;
  }
  return refreshDeviceFromScript();
}

let _deviceRefreshInFlight = false;

async function refreshDeviceFromScript(): Promise<InfoJson | null> {
  if (_deviceRefreshInFlight) return null;
  _deviceRefreshInFlight = true;
  try {
    try {
      const result = await runScript('device-info.sh', 'common');
      if (result.output) {
        result.output.split('\n').filter(Boolean).forEach(l => appendToOutput(`[device-info] ${l}`));
      }
    } catch (e) {
      console.warn('Device info script failed:', e);
    }
    const data = await fetchJson<InfoJson>(API_URLS.INFO!);
    if (data) {
      applyAllDeviceInfo(data);
    }
    return data;
  } finally {
    _deviceRefreshInFlight = false;
  }
}

export async function refreshKeyboxStatus(): Promise<KeyboxInfoJson | null> {
  const w = window as any;
  const preloaded = w.__keyboxInfoPromise;
  w.__keyboxInfoPromise = null;
  let diskData: KeyboxInfoJson | null =
    preloaded && typeof preloaded?.then === 'function' ? await preloaded : null;
  if (!diskData) {
    diskData = await fetchJson<KeyboxInfoJson>('./json/keybox_info.json');
  }
  if (diskData) applyKeyboxStatus(diskData);
  return diskData;
}

export async function recomputeKeyboxStatus(): Promise<KeyboxInfoJson | null> {
  await runKeyboxInfoScript();
  return refreshKeyboxStatus();
}

/** Run keybox_info.sh out of process so it cannot block the WebView thread. */
function runKeyboxInfoScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnScript('keybox_info.sh', 'feature');
    child.on('exit', () => resolve());
    child.on('error', (e: unknown) => reject(e));
  });
}

/**
 * Refresh through the revocation watch so a revoked keybox can be replaced
 * when Auto Keybox is enabled. Skips the shell run when the snapshot is fresh.
 */
export async function refreshKeyboxWatch(maxAgeMs = 15_000): Promise<KeyboxInfoJson | null> {
  const current = await refreshKeyboxStatus();
  const checked = current?.checked_at ? Date.parse(current.checked_at) : 0;
  if (current && checked > 0 && Date.now() - checked < maxAgeMs) return current;
  try {
    await runScript('keybox_watch.sh', 'feature');
  } catch (e) {
    console.warn('Keybox watch script failed:', e);
  }
  return refreshKeyboxStatus();
}

export async function refreshKeystoreManager(): Promise<KeystoreManagerJson | null> {
  const w = window as any;
  const preloaded = w.__keystoreManagerPromise;
  w.__keystoreManagerPromise = null;
  const data: KeystoreManagerJson | null = preloaded && typeof preloaded?.then === 'function'
    ? await preloaded
    : await fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!);
  if (data) {
    applyKeystoreManager(data);
    return data;
  }
  return refreshKeystoreManagerFromScript();
}

let _keystoreRefreshInFlight = false;

async function refreshKeystoreManagerFromScript(): Promise<KeystoreManagerJson | null> {
  if (_keystoreRefreshInFlight) return null;
  _keystoreRefreshInFlight = true;
  try {
    try {
      await runScript('keystore_info.sh', 'feature');
    } catch (e) {
      console.warn('Keystore manager info script failed:', e);
    }
    const data = await fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!);
    if (data) applyKeystoreManager(data);
    return data;
  } finally {
    _keystoreRefreshInFlight = false;
  }
}

let _lastKeystoreManager: KeystoreManagerJson | null = null;

function applyKeystoreManager(data: KeystoreManagerJson) {
  _lastKeystoreManager = data;
  const show = data.id === 'omk';
  for (const id of ['omk-restart-btn', 'omk-trust-btn']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !show;
  }
  const backendEl = document.getElementById('sp-backend');
  if (backendEl) {
    const text = data.name || (data.id && data.id !== 'none' ? data.id : (getTranslation('device_not_installed') || 'Not Installed'));
    setClipped(backendEl, text);
  }
}

function applyAllDeviceInfo(data: InfoJson) {
  applySecurityPatch(data);
}

/** Re-apply the last keystore snapshot, e.g. after the language changes. */
export function reapplyKeystoreManager() {
  if (_lastKeystoreManager) applyKeystoreManager(_lastKeystoreManager);
}

let _lastKeyboxData: KeyboxInfoJson | null = null;

/** Re-apply the last keybox snapshot, e.g. after the language changes. */
export function reapplyKeyboxStatus() {
  if (_lastKeyboxData) applyKeyboxStatus(_lastKeyboxData);
}

export function applyKeyboxStatus(data: KeyboxInfoJson) {
  _lastKeyboxData = data;
  const nameEl = document.getElementById('keybox-name');
  const byEl = document.getElementById('keybox-by');
  const source = document.getElementById('keybox-source')!;
  const versionEl = document.getElementById('keybox-version')!;
  const statusEl = document.getElementById('keybox-status')!;
  const typeEl = document.getElementById('keybox-type');
  const badgeEl = document.getElementById('kb-version-badge')!;
  if (!source || !versionEl || !statusEl || !badgeEl) return;

  const setType = (text: string, known = false) => {
    if (!typeEl) return;
    typeEl.textContent = text;
    typeEl.className = `kb-hero-status-text ${known ? 'kb-hero-type-text' : 'kb-hero-status-text--neutral'}`;
  };

  const setName = (text: string, isNeutral = false) => {
    if (nameEl) {
      nameEl.classList.add('kb-hero-keybox-name');
      nameEl.classList.toggle('kb-hero-keybox-name--neutral', isNeutral);
      nameEl.style.display = '';
      setClipped(nameEl, text);
    }
  };

  const setBy = (visible: boolean) => {
    if (byEl) {
      byEl.textContent = t('home_keybox_by', 'by');
      byEl.style.display = visible ? '' : 'none';
    }
  };

  const setSource = (text: string) => {
    source.style.display = text ? '' : 'none';
    setClipped(source, text);
  };

  if (!data.installed) {
    const notInstalled = getTranslation('device_not_installed') || 'Not Installed';
    setName(notInstalled, true);
    setBy(false);
    setSource('');
    versionEl.textContent = '';
    versionEl.className = 'kb-hero-provider-version kb-hero-provider-version--neutral';
    versionEl.style.display = 'none';
    badgeEl.textContent = '';
    badgeEl.className = 'kb-version-badge';
    statusEl.textContent = '—';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--neutral';
    setType('—');
    return;
  }

  const isPrivate = !!data.is_private || data.source?.toLowerCase() === 'private';
  const isRawbin = !!data.source && !isPrivate && data.source !== 'unknown';

  if (isPrivate) {
    setName(t('custom_kb_private_toggle', 'Private Keybox'), true);
    setBy(false);
    setSource('');
    versionEl.textContent = '';
    versionEl.style.display = 'none';
  } else if (isRawbin) {
    const kbName = data.text || (data.source_version ? (data.source_version.startsWith('v') ? data.source_version : 'v' + data.source_version) : '');
    const providerName = data.source!;

    if (kbName && providerName) {
      setName(kbName);
      setBy(true);
      setSource(providerName);
    } else {
      setName(kbName || providerName);
      setBy(false);
      setSource('');
    }
    versionEl.textContent = '';
    versionEl.style.display = 'none';
  } else {
    const genericText = data.text || getTranslation('device_generic') || 'Generic';
    setName(genericText, true);
    setBy(false);
    setSource('');
    versionEl.textContent = '';
    versionEl.style.display = 'none';
  }

  if (isRawbin) {
    setType(data.rkp === true ? t('keybox_info_rkp', 'RKP') : t('keybox_info_normal', 'Normal'), true);
  } else {
    setType('—');
  }

  if (!isRawbin && data.source_version) {
    badgeEl.textContent = getTranslation('device_generic') || 'Generic';
    badgeEl.className = 'kb-version-badge kb-version-badge--outdated';
  } else {
    badgeEl.textContent = '';
    badgeEl.className = 'kb-version-badge';
  }

  if (data.revoked) {
    statusEl.textContent = getTranslation('custom_kb_revoked') || 'Revoked';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--revoked';
  } else if (data.cert_validity === 'not_yet_valid') {
    statusEl.textContent = getTranslation('keybox_info_not_yet_valid') || 'Not yet valid';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--revoked';
  } else if (data.expired) {
    statusEl.textContent = getTranslation('custom_kb_expired') || 'Expired';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--revoked';
  } else if (data.softbanned) {
    statusEl.textContent = getTranslation('custom_kb_softbanned') || 'Softbanned';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--softbanned';
  } else if (data.cert_validity !== 'valid') {
    statusEl.textContent = getTranslation('keybox_info_validity_unknown') || 'Certificate validity unknown';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--softbanned';
  } else {
    statusEl.textContent = getTranslation('custom_kb_active') || 'Active';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--active';
  }
}

let _keyboxWatchAt = 0;

/**
 * Run the existing keybox watcher in the background and re-read the snapshot.
 * Revocation is server-side and random; spawning the watcher on WebUI open is
 * the only way to get a fresh check without blocking the WebView main thread.
 */
export function refreshKeyboxWatchInBackground(minAgeMs = 60_000): Promise<KeyboxInfoJson | null> {
  if (Date.now() - _keyboxWatchAt < minAgeMs) return refreshKeyboxStatus();
  // The exec fallback blocks the WebView main thread; only use the watcher
  // when the bridge can spawn a real background process.
  if (typeof (window as { ksu?: { spawn?: unknown } }).ksu?.spawn !== 'function') {
    return refreshKeyboxStatus();
  }
  _keyboxWatchAt = Date.now();

  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      refreshKeyboxStatus().then(resolve).catch(() => resolve(null));
    };

    const child = spawnScript('keybox_watch.sh', 'feature', ['--fresh']);
    child.on('exit', finish);
    child.on('error', finish);
  });
}

function applySecurityPatch(data: InfoJson) {
  const dateEl = document.getElementById('sp-date');
  const pifEl = document.getElementById('sp-pif');
  if (!dateEl) return;
  dateEl.textContent = data.security_patch || data.build_patch || '—';
  if (pifEl) setClipped(pifEl, data.pif_model || '—');
}

export async function refreshConflictStatus(): Promise<ConflictModule[]> {
  const snapshot = await getModulesSnapshot();
  if (snapshot?.conflicts) return snapshot.conflicts;

  // Compatibility fallback for an older snapshot or a missing state file.
  try {
    const result = await runScript('conflicts.sh', 'common');
    const raw = result.output || result.rawOutput || '[]';
    const parsed = JSON.parse(raw) as ConflictModule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Conflict status failed:', e);
    return [];
  }
}
