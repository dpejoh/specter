import { shellEscape } from './utils.js';
import { setGlobal, deleteGlobal } from './utils.js';

const ALLOWED_HOSTS = [
  'github.com',
  't.me',
  'telegram.me',
  'myst.website',
];

export function initRedirect() {
  document.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', () => openUrl((el as HTMLElement).dataset.url || ''));
  });
}

export function openUrl(rawUrl: string) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) { console.warn('Invalid URL:', e);
    return;
  }

  if (!['https:', 'http:'].includes(url.protocol)) return;
  if (!ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  if (window.ksu?.exec) {
    const cbName = `rd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setGlobal(cbName, function() { deleteGlobal(cbName); });
    window.ksu.exec(
      `am start -a android.intent.action.VIEW -d ${shellEscape(url.href)}`,
      '{}',
      cbName
    );
  } else {
    window.open(url.href, '_blank');
  }
}
