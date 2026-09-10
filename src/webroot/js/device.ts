import { fetchJson, updateListContainerCorners } from './utils.js';
import { runScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import { getTranslation } from './i18n.js';
import type { InfoJson, KeyboxInfoJson, KeystoreManagerJson } from './types.js';

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
    backendEl.textContent = data.name || (data.id && data.id !== 'none' ? data.id : (getTranslation('device_not_installed') || 'Not Installed'));
  }
  updateListContainerCorners();
}

function applyAllDeviceInfo(data: InfoJson) {
  applySecurityPatch(data);
}

function applyKeyboxStatus(data: KeyboxInfoJson) {
  const source = document.getElementById('keybox-source')!;
  const versionEl = document.getElementById('keybox-version')!;
  const statusEl = document.getElementById('keybox-status')!;
  const badgeEl = document.getElementById('kb-version-badge')!;
  if (!source || !versionEl || !statusEl || !badgeEl) return;

  if (!data.installed) {
    source.textContent = getTranslation('device_not_installed') || 'Not Installed';
    versionEl.textContent = '';
    versionEl.className = 'kb-hero-provider-version kb-hero-provider-version--neutral';
    badgeEl.textContent = '';
    badgeEl.className = 'kb-version-badge';
    statusEl.textContent = '—';
    statusEl.className = 'kb-hero-status-text kb-hero-status-text--neutral';
    return;
  }

  const isRawbin = !!data.source;
  const name = isRawbin
    ? data.source!.charAt(0).toUpperCase() + data.source!.slice(1)
    : getTranslation('device_generic') || 'Generic';
  source.textContent = name;

  versionEl.textContent = data.text || data.source_version || '—';
  versionEl.className = 'kb-hero-provider-version kb-hero-provider-version--neutral';

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
  if (pifEl) pifEl.textContent = data.pif_model || '—';
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
