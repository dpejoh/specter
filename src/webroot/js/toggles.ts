import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { CONTROL_TOGGLES } from './constants.js';
import { applyTranslations, t } from './i18n.js';
import { setDevMode } from './utils.js';

function labelFromKey(key: string): string {
  const s = key.replace(/^(toggle_|action_)/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function i18nLabelKey(key: string): string {
  return 'control_toggle_' + key.replace(/^toggle_/, '');
}

export function renderControlToggles() {
  const boot = document.getElementById('control-boot-container');
  const background = document.getElementById('control-background-container');
  const action = document.getElementById('control-action-container');
  if (!boot || !background || !action) return;

  // Re-rendering must replace rows rather than append a second copy.
  for (const container of [boot, background, action]) {
    container.querySelectorAll('[data-control-toggle]').forEach(row => row.remove());
  }

  for (const toggle of CONTROL_TOGGLES) {
    const container = toggle.section === 'boot' ? boot : toggle.section === 'background' ? background : action;
    const labelKey = i18nLabelKey(toggle.key);
    const descKey = labelKey + '_desc';

    const row = document.createElement('sp-settings-row');
    row.id = `${toggle.id}-row`;
    row.setAttribute('variant', 'toggle');
    row.dataset.controlToggle = '1';

    const icon = document.createElement('md-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = toggle.icon;

    const headline = document.createElement('span');
    headline.setAttribute('slot', 'headline');
    headline.dataset.i18n = labelKey;
    headline.textContent = toggle.title || labelFromKey(toggle.key);

    const supporting = document.createElement('span');
    supporting.setAttribute('slot', 'supporting');
    supporting.dataset.i18n = descKey;
    supporting.textContent = toggle.description || '';

    row.append(icon, headline, supporting);

    if (toggle.configurable) {
      row.setAttribute('has-page', '');
      const config = document.createElement('button');
      config.type = 'button';
      config.className = 'li-config-btn';
      config.setAttribute('data-config', '');
      config.setAttribute('slot', 'trailing');
      config.setAttribute(
        'aria-label',
        `${t('control_configure', 'Configure')} ${t(labelKey, labelFromKey(toggle.key))}`,
      );
      config.innerHTML = `<svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>`;
      const divider = document.createElement('div');
      divider.className = 'li-config-divider';
      divider.setAttribute('slot', 'trailing');
      divider.setAttribute('aria-hidden', 'true');
      row.append(config, divider);
    }

    const sw = document.createElement('md-switch');
    sw.setAttribute('slot', 'trailing');
    sw.setAttribute('icons', '');
    sw.id = toggle.id;
    sw.setAttribute('aria-label', labelFromKey(toggle.key));
    sw.setAttribute('data-i18n-aria', labelKey);
    row.append(sw);

    container.appendChild(row);
  }

  wireControlToggles();
  applyTranslations();
}

export function wireRowDialog(rowId: string, open: () => void) {
  const row = document.getElementById(rowId);
  if (!row || row.dataset.spWired) return;
  row.dataset.spWired = '1';

  const config = row.querySelector<HTMLElement>('[data-config], .li-config-btn');

  // Configurable toggle rows: the row body opens the page; the switch itself
  // toggles state. The chevron is a second, explicit affordance for the page.
  row.addEventListener('sp-activate', open);
  if (config) {
    config.addEventListener('click', event => {
      event.stopPropagation();
      open();
    });
  }
}

export function wireControlToggles() {
  for (const { id, key, default: def } of CONTROL_TOGGLES) {
    const sw = document.getElementById(id) as MdSwitch | null;
    if (!sw || sw.dataset.spControlWired === '1') continue;
    sw.dataset.spControlWired = '1';
    cfgGet(key, def || '1').then(val => { sw.selected = val !== '0'; });
    sw.addEventListener('change', () => {
      cfgSet(key, sw.selected ? '1' : '0');
    });
  }
}

export async function refreshControlToggles() {
  cfgInvalidate();
  for (const { id, key, default: def } of CONTROL_TOGGLES) {
    const sw = document.getElementById(id) as MdSwitch | null;
    if (!sw) continue;
    const val = await cfgGet(key, def || '1');
    sw.selected = val !== '0';
  }
}

export function wireDevMode() {
  const sw = document.getElementById('dev-mode-switch') as MdSwitch | null;
  if (!sw) return;
  cfgGet('dev_mode', 'false').then(val => { sw.selected = val === 'true'; });
  sw.addEventListener('change', () => {
    setDevMode(sw.selected);
    cfgSet('dev_mode', sw.selected ? 'true' : 'false');
  });
}
