import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { CONTROL_TOGGLES } from './constants.js';
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

  for (const toggle of CONTROL_TOGGLES) {
    const container = toggle.section === 'boot' ? boot : toggle.section === 'background' ? background : action;
    const labelKey = i18nLabelKey(toggle.key);
    const descKey = labelKey + '_desc';

    const row = document.createElement('div');
    row.className = 'list-item list-item--toggle';
    row.id = toggle.id + '-row';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'li-icon';
    iconDiv.innerHTML = `<md-icon aria-hidden="true">${toggle.icon}</md-icon>`;

    const content = document.createElement('div');
    content.className = 'list-item-content';

    const label = document.createElement('div');
    label.className = 'toggle-text';
    label.dataset.i18n = labelKey;
    label.textContent = labelFromKey(toggle.key);
    content.appendChild(label);

    const hint = document.createElement('span');
    hint.className = 'supporting-text';
    hint.dataset.i18n = descKey;
    content.appendChild(hint);

    const spacer = document.createElement('div');
    spacer.className = 'spacer';

    const sw = document.createElement('md-switch');
    sw.icons = true;
    sw.id = toggle.id;
    sw.setAttribute('aria-label', labelFromKey(toggle.key));
    sw.dataset.i18nAria = labelKey;

    const ripple = document.createElement('md-ripple');

    row.appendChild(iconDiv);
    row.appendChild(content);
    row.appendChild(spacer);
    row.appendChild(sw);
    row.appendChild(ripple);
    container.appendChild(row);
  }

  wireControlToggles();
}

export function wireControlToggles() {
  for (const { id, key, default: def } of CONTROL_TOGGLES) {
    const sw = document.getElementById(id) as MdSwitch | null;
    if (!sw) continue;
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
  sw.addEventListener('change', () => {
    setDevMode(sw.selected);
    cfgSet('dev_mode', sw.selected ? 'true' : 'false');
  });
}
