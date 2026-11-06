import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { CONTROL_TOGGLES } from './constants.js';
import { applyTranslations, t } from './i18n.js';
import { escapeHtml, makeRowInteractive, setDevMode } from './utils.js';
import { rowIcon, rowShell } from './ui-row.js';

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

    const configCue = toggle.configurable
      ? `<button type="button" class="li-config-btn" aria-label="${escapeHtml(`${t('control_configure', 'Configure')} ${labelFromKey(toggle.key)}`)}">
           <svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>
         </button>
         <div class="li-config-divider" aria-hidden="true"></div>`
      : '';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = rowShell({
      id: `${toggle.id}-row`,
      className: 'list-item--toggle',
      leading: rowIcon(toggle.icon),
      content: `<div class="list-item-content">
        <div class="toggle-text" data-i18n="${labelKey}">${escapeHtml(toggle.title || labelFromKey(toggle.key))}</div>
        <span class="supporting-text" data-i18n="${descKey}">${escapeHtml(toggle.description || '')}</span>
      </div>`,
      trailing: `<div class="li-toggle-action">
        ${configCue}
        <md-switch icons id="${toggle.id}" aria-label="${escapeHtml(labelFromKey(toggle.key))}" data-i18n-aria="${labelKey}"></md-switch>
      </div>`,
    });
    const row = wrapper.firstElementChild as HTMLElement;
    container.appendChild(row);
  }

  wireControlToggles();
  applyTranslations();
}

export function wireRowDialog(rowId: string, open: () => void) {
  const row = document.getElementById(rowId);
  if (!row || row.dataset.spWired) return;
  row.dataset.spWired = '1';
  makeRowInteractive(row);
  const activate = (e: Event) => {
    if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
    open();
  };
  row.addEventListener('click', activate);
  row.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate(e);
  });
}

export function wireControlToggles() {
  for (const { id, key, default: def, configurable } of CONTROL_TOGGLES) {
    const sw = document.getElementById(id) as MdSwitch | null;
    if (!sw) continue;
    cfgGet(key, def || '1').then(val => { sw.selected = val !== '0'; });
    sw.addEventListener('change', () => {
      cfgSet(key, sw.selected ? '1' : '0');
    });
    const row = sw.closest('.list-item');
    if (row && !configurable) {
      row.addEventListener('click', e => {
        if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
        sw.selected = !sw.selected;
        sw.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
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
  const row = sw.closest('.list-item');
  if (row) {
    row.addEventListener('click', e => {
      if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
      sw.selected = !sw.selected;
      setDevMode(sw.selected);
      cfgSet('dev_mode', sw.selected ? 'true' : 'false');
    });
  }
}
