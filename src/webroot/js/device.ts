import { fetchJson, setText } from './utils.js';
import { runScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import { getTranslation } from './i18n.js';
import type { InfoJson, KeyboxInfoJson } from './types.js';

export async function initDevice() {
  await Promise.all([refreshDevice(), refreshKeyboxStatus()]);
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
  const data = await fetchJson<InfoJson>(API_URLS.INFO);
  if (data) applyAllDeviceInfo(data);
  return data;
}

export async function refreshKeyboxStatus(): Promise<KeyboxInfoJson | null> {
  const diskData = await fetchJson<KeyboxInfoJson>(API_URLS.KEYBOX_INFO);
  if (diskData) applyKeyboxStatus(diskData);
  return diskData;
}

function applyAllDeviceInfo(data: InfoJson) {
  applyDeviceInfo(data);
  if (data.flags) applyFlags(data.flags);
  applyTeeStatus(data);
  applySecurityPatch(data);
}

function applyDeviceInfo(data: InfoJson) {
  setText('root-value', data.root || '—');
  setText('version-info-value', data.version || '—');
}

function applyFlags(flags: { twrp?: boolean; recovery_detected?: boolean }) {
  if (!flags) return;
  const recoveryRow = document.getElementById('toggle-recovery-row');
  if (recoveryRow) {
    recoveryRow.style.display = flags.recovery_detected ? '' : 'none';
  }
}

function applyKeyboxStatus(data: KeyboxInfoJson) {
  const source = document.getElementById('keybox-source')!;
  const versionEl = document.getElementById('keybox-version')!;
  const statusEl = document.getElementById('keybox-status')!;
  const badgeEl = document.getElementById('kb-version-badge')!;
  if (!source || !statusEl || !badgeEl) return;

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

  const name = data.source
    ? data.source.charAt(0).toUpperCase() + data.source.slice(1)
    : getTranslation('device_generic') || 'Generic';
  source.textContent = name;

  versionEl.textContent = data.text || data.source_version || '—';
  versionEl.className = 'kb-hero-provider-version kb-hero-provider-version--neutral';

  if (data.up_to_date && data.source_version) {
    badgeEl.textContent = getTranslation('device_latest') || 'Latest';
    badgeEl.className = 'kb-version-badge kb-version-badge--latest';
  } else if (data.source_version) {
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
  dateEl.textContent = data.security_patch || '—';
  if (pifEl) pifEl.textContent = data.pif_model || '—';
}

function applyTeeStatus(data: InfoJson) {
  const el = document.getElementById('tee-value');
  const card = document.getElementById('tee-status-card');
  const spTee = document.getElementById('sp-tee');
  if (!el || !card) return;
  const status = data.tee_status || '';
  const label = status === 'broken' ? 'Broken' : status === 'normal' ? 'Normal' : '—';
  el.textContent = label;
  card.className = 'info-card-mini';
  if (status === 'broken') {
    card.classList.add('info-card-mini--warning');
  } else if (status === 'normal') {
    card.classList.add('info-card-mini--success');
  }
  if (spTee) {
    spTee.textContent = label;
    spTee.className = 'sp-hero-tee';
    if (status === 'broken') spTee.classList.add('sp-hero-tee--broken');
    else if (status === 'normal') spTee.classList.add('sp-hero-tee--normal');
  }
}

interface ConflictModule {
  key: string;
  friendlyName: string;
  detected: boolean;
  prioritySpecter: boolean;
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
