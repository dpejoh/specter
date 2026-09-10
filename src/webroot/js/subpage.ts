import '@material/web/switch/switch.js';
import '@material/web/icon/icon.js';
import '@material/web/ripple/ripple.js';
import type { MdSwitch } from '@material/web/switch/switch.js';
import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export interface SubPageSwitchItem {
  type?: 'switch';
  id: string;
  key: string;
  defaultVal?: string;
  icon?: string;
  title: string;
  description: string;
  onChange?: (checked: boolean) => void;
}

export interface SubPageInputItem {
  type: 'input';
  id: string;
  key?: string;
  defaultVal?: string;
  icon?: string;
  title: string;
  description?: string;
  inputType?: 'number' | 'text';
  value?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  ariaLabel?: string;
  getValue?: () => Promise<string> | string;
  onChange?: (value: string) => void;
}

export interface SubPageCustomItem {
  type: 'custom';
  id?: string;
  render: (container: HTMLElement, isEnabled: () => boolean) => void;
}

export type SubPageItem = SubPageSwitchItem | SubPageInputItem | SubPageCustomItem;

export interface SubPageGroup {
  title?: string;
  description?: string;
  items: SubPageItem[];
}

export interface SubPageMasterToggle {
  key: string;
  defaultVal?: string;
  title: string;
  description?: string;
  syncSwitchId?: string;
  onChange?: (enabled: boolean) => void;
}

export interface SubPageInfoCard {
  title?: string;
  text: string;
  icon?: string;
}

export interface SubPageConfig {
  id: string;
  title: string;
  icon?: string;
  masterToggle?: SubPageMasterToggle;
  groups: SubPageGroup[];
  infoCard?: SubPageInfoCard;
  footer?: (container: HTMLElement, instance: SubPageInstance) => void;
  onClose?: () => void;
}

export interface SubPageInstance {
  overlay: HTMLElement;
  close: () => void;
  isMasterEnabled: () => boolean;
}

export async function openSubPage(config: SubPageConfig): Promise<SubPageInstance> {
  const overlay = document.createElement('div');
  overlay.className = 'subpage-overlay';
  overlay.id = `subpage-${config.id}`;

  let masterEnabled = true;
  if (config.masterToggle) {
    const raw = await cfgGet(config.masterToggle.key, config.masterToggle.defaultVal ?? '1');
    masterEnabled = raw !== '0';
  }

  // Pre-fetch all switch and input config states concurrently
  const switchValues = new Map<string, boolean>();
  const inputValues = new Map<string, string>();
  const fetchPromises: Promise<void>[] = [];

  for (const group of config.groups) {
    for (const item of group.items) {
      if (!item.type || item.type === 'switch') {
        const swItem = item as SubPageSwitchItem;
        fetchPromises.push(
          cfgGet(swItem.key, swItem.defaultVal ?? '1').then(val => {
            switchValues.set(swItem.key, val !== '0');
          })
        );
      } else if (item.type === 'input') {
        const inpItem = item as SubPageInputItem;
        if (inpItem.getValue) {
          fetchPromises.push(
            Promise.resolve(inpItem.getValue()).then(val => {
              inputValues.set(inpItem.id, val);
            })
          );
        } else if (inpItem.key) {
          fetchPromises.push(
            cfgGet(inpItem.key, inpItem.defaultVal ?? '').then(val => {
              inputValues.set(inpItem.id, inpItem.value ?? val ?? '');
            })
          );
        } else if (inpItem.value !== undefined) {
          inputValues.set(inpItem.id, inpItem.value);
        }
      }
    }
  }

  await Promise.all(fetchPromises);

  // Build inner HTML structure reusing Specter's native .list-container and .list-item styling
  overlay.innerHTML = `
    <div class="subpage-inner">
      <header class="subpage-header">
        <button class="subpage-back-btn" id="subpage-back" aria-label="${t('dialog_cancel', 'Back')}">
          <md-icon aria-hidden="true">arrow_back</md-icon>
          <md-ripple></md-ripple>
        </button>
        <h1 class="subpage-title">${config.title}</h1>
      </header>

      <div class="subpage-content" id="subpage-scroll-area">
        ${config.masterToggle ? `
          <div class="subpage-master-container">
            <div class="list-item list-item--toggle subpage-master-item ${masterEnabled ? 'subpage-master-item--active' : ''}" id="subpage-master-card">
              <div class="list-item-content">
                <div class="toggle-text subpage-master-text">${config.masterToggle.title}</div>
                ${config.masterToggle.description ? `<span class="supporting-text">${config.masterToggle.description}</span>` : ''}
              </div>
              <md-switch icons id="subpage-master-switch" ${masterEnabled ? 'selected' : ''} aria-label="${config.masterToggle.title}"></md-switch>
              <md-ripple></md-ripple>
            </div>
          </div>
        ` : ''}

        <div class="subpage-options-wrapper ${!masterEnabled && config.masterToggle ? 'subpage-options--disabled' : ''}" id="subpage-options-wrapper">
          ${config.groups.map((group, gIdx) => `
            ${group.title ? `<h2 class="list-title">${group.title}</h2>` : ''}
            ${group.description ? `<p class="supporting-text" style="padding:0 20px 8px;max-width:800px;margin:0 auto;box-sizing:border-box;">${group.description}</p>` : ''}
            <div class="list-container" id="subpage-group-${gIdx}">
              ${group.items.map((item, iIdx) => {
                if (item.type === 'custom') {
                  return `<div class="subpage-custom-item" id="subpage-custom-${gIdx}-${iIdx}"></div>`;
                }
                if (item.type === 'input') {
                  const inpItem = item as SubPageInputItem;
                  const currentVal = inputValues.get(inpItem.id) ?? inpItem.value ?? '';
                  return `
                    <div class="list-item list-item--input" id="${inpItem.id}-row">
                      ${inpItem.icon ? `<div class="li-icon"><md-icon aria-hidden="true">${inpItem.icon}</md-icon></div>` : ''}
                      <div class="list-item-content">
                        <div class="toggle-text">${inpItem.title}</div>
                        ${inpItem.description ? `<span class="supporting-text">${inpItem.description}</span>` : ''}
                      </div>
                      <div class="spacer"></div>
                      <div class="subpage-input-wrapper">
                        <input
                          type="${inpItem.inputType || 'number'}"
                          id="${inpItem.id}"
                          class="subpage-inline-input"
                          value="${currentVal}"
                          ${inpItem.min !== undefined ? `min="${inpItem.min}"` : ''}
                          ${inpItem.max !== undefined ? `max="${inpItem.max}"` : ''}
                          ${inpItem.step !== undefined ? `step="${inpItem.step}"` : ''}
                          aria-label="${inpItem.ariaLabel || inpItem.title}"
                        />
                        ${inpItem.unit ? `<span class="subpage-input-unit">${inpItem.unit}</span>` : ''}
                      </div>
                    </div>
                  `;
                }
                const swItem = item as SubPageSwitchItem;
                const isChecked = switchValues.get(swItem.key) ?? true;
                return `
                  <div class="list-item list-item--toggle" id="${swItem.id}-row">
                    ${swItem.icon ? `<div class="li-icon"><md-icon aria-hidden="true">${swItem.icon}</md-icon></div>` : ''}
                    <div class="list-item-content">
                      <div class="toggle-text">${swItem.title}</div>
                      <span class="supporting-text">${swItem.description}</span>
                    </div>
                    <md-switch icons id="${swItem.id}" ${isChecked ? 'selected' : ''} aria-label="${swItem.title}"></md-switch>
                    <md-ripple></md-ripple>
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>

        <div class="subpage-footer" id="subpage-footer" ${config.footer ? '' : 'style="display:none;"'}></div>

        ${config.infoCard ? `
          <div class="subpage-info-note">
            <md-icon aria-hidden="true">${config.infoCard.icon || 'info'}</md-icon>
            <div>
              ${config.infoCard.title ? `<strong style="display:block;margin-bottom:2px;color:var(--md-sys-color-on-surface);">${config.infoCard.title}</strong>` : ''}
              <p>${config.infoCard.text}</p>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Setup custom renderers
  config.groups.forEach((group, gIdx) => {
    group.items.forEach((item, iIdx) => {
      if (item.type === 'custom') {
        const host = overlay.querySelector(`#subpage-custom-${gIdx}-${iIdx}`) as HTMLElement;
        if (host) item.render(host, () => masterEnabled);
      }
    });
  });

  // History and Back navigation setup
  let closed = false;
  function closeOverlay() {
    if (closed) return;
    closed = true;
    window.isOverlayOpen = false;
    window.removeEventListener('popstate', onPopState);
    overlay.classList.remove('subpage-overlay--open');
    document.documentElement.style.overflow = '';
    config.onClose?.();
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function onPopState() {
    closeOverlay();
  }

  requestAnimationFrame(() => overlay.classList.add('subpage-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ subpage: config.id }, '');
  window.addEventListener('popstate', onPopState);

  overlay.querySelector('#subpage-back')?.addEventListener('click', () => history.back());

  // Master switch interaction
  const masterSwitch = overlay.querySelector('#subpage-master-switch') as MdSwitch | null;
  const masterCard = overlay.querySelector('#subpage-master-card') as HTMLElement | null;
  const optionsWrapper = overlay.querySelector('#subpage-options-wrapper') as HTMLElement | null;

  if (masterSwitch && config.masterToggle) {
    const mt = config.masterToggle;
    const onMasterToggle = (val: boolean) => {
      masterEnabled = val;
      cfgSet(mt.key, masterEnabled ? '1' : '0');

      if (masterCard) {
        masterCard.classList.toggle('subpage-master-item--active', masterEnabled);
      }
      if (optionsWrapper) {
        optionsWrapper.classList.toggle('subpage-options--disabled', !masterEnabled);
      }

      // Sync with parent toggle on Control page if present
      if (mt.syncSwitchId) {
        const parentSw = document.getElementById(mt.syncSwitchId) as MdSwitch | null;
        if (parentSw) parentSw.selected = masterEnabled;
      }

      mt.onChange?.(masterEnabled);
    };

    masterSwitch.addEventListener('change', () => {
      onMasterToggle(masterSwitch.selected);
    });

    masterCard?.addEventListener('click', (e) => {
      if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
      masterSwitch.selected = !masterSwitch.selected;
      onMasterToggle(masterSwitch.selected);
    });
  }

  // Child switches interactions
  config.groups.forEach(group => {
    group.items.forEach(item => {
      if (!item.type || item.type === 'switch') {
        const swItem = item as SubPageSwitchItem;
        const sw = overlay.querySelector(`#${swItem.id}`) as MdSwitch | null;
        const row = overlay.querySelector(`#${swItem.id}-row`) as HTMLElement | null;

        if (sw) {
          sw.addEventListener('change', () => {
            cfgSet(swItem.key, sw.selected ? '1' : '0');
            swItem.onChange?.(sw.selected);
          });
        }

        if (row && sw) {
          row.addEventListener('click', (e) => {
            if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
            sw.selected = !sw.selected;
            cfgSet(swItem.key, sw.selected ? '1' : '0');
            swItem.onChange?.(sw.selected);
          });
        }
      } else if (item.type === 'input') {
        const inpItem = item as SubPageInputItem;
        const input = overlay.querySelector(`#${inpItem.id}`) as HTMLInputElement | null;
        if (input) {
          const handleInput = () => {
            if (inpItem.key) cfgSet(inpItem.key, input.value);
            inpItem.onChange?.(input.value);
          };
          input.addEventListener('change', handleInput);
          input.addEventListener('input', handleInput);
        }
      }
    });
  });

  const instance: SubPageInstance = {
    overlay,
    close: () => history.back(),
    isMasterEnabled: () => masterEnabled,
  };

  if (config.footer) {
    const footerEl = overlay.querySelector('#subpage-footer') as HTMLElement | null;
    if (footerEl) config.footer(footerEl, instance);
  }

  return instance;
}
