import { showToast } from './toast.js';
import { ONLINE_ENDPOINTS } from './constants.js';
import { getTranslation } from './i18n.js';

let lastStatus: boolean | null = null;

export function initNetwork() {
  updateNetworkStatus();
  setInterval(updateNetworkStatus, 15000);
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

async function updateNetworkStatus() {
  const online = await checkOnline();
  if (online === lastStatus) return;
  lastStatus = online;

  const netChip = document.getElementById('network-chip');
  const netAnnounce = document.getElementById('network-announce');
  const onlineText = getTranslation('home_status_online') || 'Online';
  const offlineText = getTranslation('home_status_offline') || 'Offline';

  if (netChip) {
    const label = netChip.querySelector('#network-label');
    const icon = netChip.querySelector('md-icon');
    netChip.classList.toggle('offline', !online);
    if (label) label.textContent = online ? onlineText : offlineText;
    if (icon) icon.textContent = online ? 'wifi' : 'wifi_off';
  }
  if (netAnnounce) netAnnounce.textContent = online ? onlineText : offlineText;
  if (!online) showToast(offlineText);
}

async function checkOnline(): Promise<boolean> {
  for (const endpoint of ONLINE_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 1500);
      await fetch(endpoint, { signal: ctrl.signal, mode: 'no-cors' });
      return true;
    } catch { /* try next */ }
  }
  return false;
}
