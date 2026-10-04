import { fetchJson, updateListContainerCorners } from './utils.js';
import { runScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import { getTranslation } from './i18n.js';
import type { InfoJson, KeyboxInfoJson, KeystoreManagerJson } from './types.js';

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
  document.getElementById('kb-refresh-btn')?.addEventListener('click', () => {
    recomputeKeyboxStatus().catch(() => {});
  });
  await Promise.all([refreshDevice(), refreshKeyboxStatus(), refreshKeystoreManager()]);
}

export async function refreshDevice(): Promise<InfoJson | null> {
  try {
    const result = await runScript('device-info.sh', 'common');
    if (result.output) {
      result.output.split('\n').filter(Boolean).forEach(l => appendToOutput(`[device-info] ${l}`));
    }
  } catch (e) {
    console.warn('Device info script failed:', e);
  }
  const preloaded = (window as any).__infoPromise;
  const data = preloaded && typeof preloaded?.then === 'function'
    ? await preloaded
    : await fetchJson<InfoJson>(API_URLS.INFO!);
  if (data) applyAllDeviceInfo(data);
  return data;
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

async function recomputeKeyboxStatus(): Promise<KeyboxInfoJson | null> {
  try {
    await runScript('keybox_info.sh', 'feature');
  } catch (e) {
    console.warn('Keybox info script failed:', e);
  }
  return refreshKeyboxStatus();
}

export async function refreshKeystoreManager(): Promise<KeystoreManagerJson | null> {
  try {
    await runScript('keystore_info.sh', 'feature');
  } catch (e) {
    console.warn('Keystore manager info script failed:', e);
  }
  const data = await fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!);
  if (data) applyKeystoreManager(data);
  return data;
}

function applyKeystoreManager(data: KeystoreManagerJson) {
  const show = data.id === 'omk';
  for (const id of ['omk-restart-keymint', 'omk-restart-injector', 'omk-trust-btn']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !show;
  }
  const backendEl = document.getElementById('sp-backend');
  if (backendEl) {
    const text = data.name || (data.id && data.id !== 'none' ? data.id : (getTranslation('device_not_installed') || 'Not Installed'));
    setClipped(backendEl, text);
  }
  updateListContainerCorners();
}

function applyAllDeviceInfo(data: InfoJson) {
  applySecurityPatch(data);
}

export function applyKeyboxStatus(data: KeyboxInfoJson) {
  const nameEl = document.getElementById('keybox-name');
  const byEl = document.getElementById('keybox-by');
  const source = document.getElementById('keybox-source')!;
  const versionEl = document.getElementById('keybox-version')!;
  const statusEl = document.getElementById('keybox-status')!;
  const badgeEl = document.getElementById('kb-version-badge')!;
  if (!source || !versionEl || !statusEl || !badgeEl) return;

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
      byEl.textContent = 'by';
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
    return;
  }

  const isPrivate = !!data.is_private || data.source?.toLowerCase() === 'private';
  const isRawbin = !!data.source && !isPrivate && data.source !== 'unknown';

  if (isPrivate) {
    setName('Private Keybox', true);
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

  if (isRawbin && data.up_to_date && data.source_version) {
    badgeEl.textContent = getTranslation('device_latest') || 'Latest';
    badgeEl.className = 'kb-version-badge kb-version-badge--latest';
  } else if (!isRawbin && data.source_version) {
    badgeEl.textContent = getTranslation('device_generic') || 'Generic';
    badgeEl.className = 'kb-version-badge kb-version-badge--outdated';
  } else {
    badgeEl.textContent = '';
    badgeEl.className = 'kb-version-badge';
  }

  if (data.revoked) {
    statusEl.textContent = getTranslation('custom_kb_revoked') || 'Revoked';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--revoked';
  } else if (data.softbanned) {
    statusEl.textContent = getTranslation('custom_kb_softbanned') || 'Softbanned';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--softbanned';
  } else {
    statusEl.textContent = getTranslation('custom_kb_active') || 'Active';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--active';
  }
}

function applySecurityPatch(data: InfoJson) {
  const dateEl = document.getElementById('sp-date');
  const pifEl = document.getElementById('sp-pif');
  if (!dateEl) return;
  dateEl.textContent = data.security_patch || data.build_patch || '—';
  if (pifEl) setClipped(pifEl, data.pif_model || '—');
}

interface ConflictModule {
  key: string;
  friendlyName: string;
  detected: boolean;
  prioritySpecter: boolean;
  features?: string;
}

export async function refreshConflictStatus(): Promise<ConflictModule[]> {
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
