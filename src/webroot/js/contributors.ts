import { escapeHtml, fetchJson } from './utils.js';
import { getTranslation } from './i18n.js';
import { openUrl } from './redirect.js';
import type { DevEntry } from './types.js';

export async function loadContributors() {
  const grid = document.getElementById('contributors-grid');
  if (!grid) return;

  let devs: DevEntry[] = [];
  try {
    devs = await fetchJson<DevEntry[]>(`json/dev.json`, 1800000) || [];
    if (!devs.length) { console.warn('Failed to load contributors'); return; }
  } catch {
    console.warn('Failed to load contributors');
    return;
  }

  grid.innerHTML = devs.map(dev => `
    <md-outlined-card class="contributor-card"
               data-url="${encodeURIComponent(dev.github || '')}">
      <img class="contributor-avatar"
           src="${escapeHtml(dev.avatar || '')}"
           alt="${escapeHtml(dev.name)}"
           loading="lazy" />
      <div class="contributor-info">
        <p class="md-typescale-label-large contributor-name">
          ${escapeHtml(dev.name)}
        </p>
        <p class="md-typescale-label-small contributor-role">
          ${escapeHtml(getTranslation('role_' + dev.role) || dev.role)}
        </p>
      </div>
    </md-outlined-card>
  `).join('');

  grid.querySelectorAll('.contributor-avatar').forEach(img => {
    img.addEventListener('error', () => { (img as HTMLImageElement).src = 'assets/icon.png'; }, { once: true });
  });

  grid.querySelectorAll('[data-url]').forEach(card => {
    card.addEventListener('click', () => {
      openUrl(decodeURIComponent((card as HTMLElement).dataset.url || ''));
    });
  });
}
