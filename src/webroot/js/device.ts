import { fetchJson, setText } from './utils.js';
import { runScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import { getTranslation } from './i18n.js';
import type { InfoJson, KeyboxInfoJson } from './types.js';

const CACHE_TTL = 30000;

interface DeviceCache {
  device: InfoJson | null;
  keybox: KeyboxInfoJson | null;
  ts: number;
}

function restoreCache() {
  try {
    const raw = localStorage.getItem('specter_device_cache');
    if (!raw) return;
    const cache: DeviceCache = JSON.parse(raw);
    if (Date.now() - cache.ts > CACHE_TTL) return;
    if (cache.device) applyAllDeviceInfo(cache.device);
    if (cache.keybox) applyKeyboxStatus(cache.keybox);
  } catch (e) {}
}

function saveCache(device: InfoJson | null, keybox: KeyboxInfoJson | null) {
  try {
    localStorage.setItem('specter_device_cache', JSON.stringify({ device, keybox, ts: Date.now() }));
  } catch (e) {}
}

export async function initDevice() {
  restoreCache();
  const [deviceData, keyboxData] = await Promise.all([refreshDevice(), refreshKeyboxStatus()]);
  if (deviceData || keyboxData) saveCache(deviceData, keyboxData);
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

export async function refreshKeyboxStatus(exec = true): Promise<KeyboxInfoJson | null> {
  if (exec) {
    try {
      const result = await runScript('keybox_info.sh', 'feature');
      if (result.output) {
        result.output.split('\n').filter(Boolean).forEach(l => appendToOutput(`[keybox] ${l}`));
      }
    } catch (e) {
      console.warn('Keybox info script failed:', e);
    }
  }
  const data = await fetchJson<KeyboxInfoJson>(API_URLS.KEYBOX_INFO);
  if (data) applyKeyboxStatus(data);
  return data;
}

function applyAllDeviceInfo(data: InfoJson) {
  applyDeviceInfo(data);
  if (data.flags) applyFlags(data.flags);
  applyTeeStatus(data);
}

function applyDeviceInfo(data: InfoJson) {
  setText('android-value', data.android || '—');
  setText('kernel-value', data.kernel || '—');
  setText('root-value', data.root || '—');
  setText('version-info-value', data.version || '—');
  setText('patch-value', data.security_patch || data.build_patch || '—');
}

function applyFlags(flags: { twrp?: boolean; recovery_detected?: boolean }) {
  if (!flags) return;
  const recoveryRow = document.getElementById('toggle-recovery-row');
  if (recoveryRow) {
    recoveryRow.style.display = flags.recovery_detected ? '' : 'none';
  }
}

function applyTeeStatus(data: InfoJson) {
  const el = document.getElementById('tee-value');
  const card = document.getElementById('tee-status-card');
  if (!el || !card) return;
  const status = data.tee_status || '';
  el.textContent = status === 'broken' ? 'Broken' : status === 'normal' ? 'Normal' : '—';
  card.className = 'info-card';
  if (status === 'broken') {
    card.classList.add('info-card--warning');
  } else if (status === 'normal') {
    card.classList.add('info-card--success');
  }
}

function applyKeyboxStatus(data: KeyboxInfoJson) {
  const source = document.getElementById('keybox-source')!;
  const statusEl = document.getElementById('keybox-status')!;
  const icon = document.getElementById('keybox-icon')!;
  if (!source || !statusEl || !icon) return;

  if (!data.installed) {
    source.textContent = getTranslation('device_not_installed') || 'Not Installed';
    source.className = 'keybox-chip keybox-chip--neutral';
    statusEl.style.display = 'none';
    icon.textContent = 'vpn_key_off';
    return;
  }

  statusEl.style.display = '';

  if (data.source === 'Private') {
    source.textContent = getTranslation('device_private_keybox') || 'Private Keybox';
    source.className = 'keybox-chip keybox-chip--neutral';
    icon.textContent = 'lock';
  } else if (data.source) {
    const name = data.source.charAt(0).toUpperCase() + data.source.slice(1);
    const label = data.text ? `${name} ${data.text}` : name;
    if (data.up_to_date) {
      source.textContent = label + ' \u00B7 ' + (getTranslation('device_latest') || 'Latest');
      source.className = 'keybox-chip keybox-chip--latest';
      icon.textContent = 'verified_user';
    } else {
      source.textContent = label;
      source.className = 'keybox-chip keybox-chip--outdated';
      icon.textContent = 'system_update';
    }
  } else {
    source.textContent = getTranslation('device_generic') || 'Generic';
    source.className = 'keybox-chip keybox-chip--neutral';
    icon.textContent = 'key';
  }

  if (data.revoked) {
    statusEl.textContent = getTranslation('custom_kb_revoked') || 'Revoked';
    statusEl.className = 'keybox-chip keybox-chip--revoked';
    source.className = 'keybox-chip keybox-chip--revoked';
    icon.textContent = 'gpp_bad';
  } else if (data.softbanned) {
    statusEl.textContent = getTranslation('custom_kb_softbanned') || 'Softbanned';
    statusEl.className = 'keybox-chip keybox-chip--softbanned';
    icon.textContent = 'warning';
  } else {
    statusEl.textContent = getTranslation('custom_kb_active') || 'Active';
    statusEl.className = 'keybox-chip keybox-chip--active';
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
