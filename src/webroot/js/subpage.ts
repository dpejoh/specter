import '@material/web/switch/switch.js';
import '@material/web/icon/icon.js';
import '@material/web/ripple/ripple.js';
import type { MdSwitch } from '@material/web/switch/switch.js';
import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { setupOverlayA11y } from './overlay-a11y.js';
import './ui/sp-settings-row.js';
import './ui/sp-settings-section.js';
import { overlayHeader } from './ui-overlay.js';


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
  layout?: 'inline' | 'block';
  value?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
  autocapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autocomplete?: string;
  spellcheck?: boolean;
  ariaLabel?: string;
  getValue?: () => Promise<string> | string;
  onChange?: (value: string) => void;
}

export interface SubPageCustomItem {
  type: 'custom';
  id?: string;
  render: (container: HTMLElement, isEnabled: () => boolean) => void;
}

export interface SubPageRadioItem {
  type: 'radio';
  id: string;
  name: string;
  value: string;
  title: string;
  description?: string;
  icon?: string;
  badge?: string;
  selected?: boolean;
  onSelect?: (value: string) => void;
}

export type SubPageItem = SubPageSwitchItem | SubPageInputItem | SubPageCustomItem | SubPageRadioItem;

export interface SubPageGroup {
  title?: string;
  description?: string;
  items: SubPageItem[];
}

export interface SubPageMasterToggle {
  key?: string;
  defaultVal?: string;
  title: string;
  description?: string;
  syncSwitchId?: string;
  onChange?: (enabled: boolean) => void;
  getValue?: () => Promise<boolean> | boolean;
  setValue?: (enabled: boolean) => Promise<void> | void;
}

export interface SubPageInfoCard {
  title?: string;
  text: string;
  icon?: string;
}

export interface SubPageConfig {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  masterToggle?: SubPageMasterToggle;
  groups: SubPageGroup[];
  infoCard?: SubPageInfoCard;
  headerAction?: (container: HTMLElement, instance: SubPageInstance) => void;
  fab?: (container: HTMLElement, instance: SubPageInstance) => void;
  footer?: (container: HTMLElement, instance: SubPageInstance) => void;
  onClose?: () => void;
}

export interface SubPageInstance {
  overlay: HTMLElement;
  close: () => void;
  isMasterEnabled: () => boolean;
}

const pendingSubpages = new Map<string, Promise<SubPageInstance>>();

export function openSubPage(config: SubPageConfig): Promise<SubPageInstance> {
  const existing = document.getElementById(`subpage-${config.id}`) as (HTMLElement & { __spInstance?: SubPageInstance }) | null;
  if (existing?.__spInstance) return Promise.resolve(existing.__spInstance);
  const pending = pendingSubpages.get(config.id);
  if (pending) return pending;
  const promise = openSubPageInternal(config).finally(() => pendingSubpages.delete(config.id));
  pendingSubpages.set(config.id, promise);
  return promise;
}

async function openSubPageInternal(config: SubPageConfig): Promise<SubPageInstance> {
  // Subpage-only Material components are loaded on first use.
  await import('./material-subpages.js');

  const overlay = document.createElement('div');
  overlay.className = 'subpage-overlay';
  overlay.id = `subpage-${config.id}`;

  let masterEnabled = true;
  if (config.masterToggle) {
    if (config.masterToggle.getValue) {
      masterEnabled = await config.masterToggle.getValue();
    } else if (config.masterToggle.key) {
      const raw = await cfgGet(config.masterToggle.key, config.masterToggle.defaultVal ?? '1');
      masterEnabled = raw !== '0';
    }
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

  // Build the subpage shell with component-based row containers.
  overlay.innerHTML = `
    <div class="subpage-inner">
      ${overlayHeader({
        className: 'subpage-header',
        back: { id: 'subpage-back', className: 'subpage-back-btn', label: t('common_back', 'Back') },
        title: config.title,
        titleClass: 'subpage-title',
        titleId: `subpage-title-${config.id}`,
        actions: '<div class="subpage-header-actions" id="subpage-header-actions"></div>',
      })}

      <div class="subpage-content" id="subpage-scroll-area">
        ${config.description ? `
          <p class="subpage-top-desc">${escapeHtml(config.description)}</p>
        ` : ''}
        ${config.masterToggle ? '<div class="subpage-master-container" id="subpage-master-container"></div>' : ''}

        <div class="subpage-options-wrapper ${!masterEnabled && config.masterToggle ? 'subpage-options--disabled' : ''}" id="subpage-options-wrapper">
          ${config.groups.map((group, gIdx) => `
            ${group.title ? `<h2 class="list-title">${escapeHtml(group.title)}</h2>` : ''}
            ${group.description ? `<p class="supporting-text subpage-group-desc">${escapeHtml(group.description)}</p>` : ''}
            <sp-settings-section id="subpage-group-${gIdx}" tone="primary"></sp-settings-section>
          `).join('')}
        </div>

        <div class="subpage-footer" id="subpage-footer" ${config.footer ? '' : 'hidden'}></div>

        ${config.infoCard ? `
          <div class="subpage-info-note">
            <md-icon aria-hidden="true">${escapeHtml(config.infoCard.icon || 'info')}</md-icon>
            <div>
              ${config.infoCard.title ? `<strong class="subpage-info-title">${escapeHtml(config.infoCard.title)}</strong>` : ''}
              <p>${escapeHtml(config.infoCard.text)}</p>
            </div>
          </div>
        ` : ''}
      </div>
      <div id="subpage-fab-slot"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const makeIcon = (name?: string): HTMLElement | null => {
    if (!name) return null;
    const icon = document.createElement('md-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = name;
    return icon;
  };

  const makeHeadline = (text: string, badge?: string): HTMLElement => {
    const headline = document.createElement('span');
    headline.setAttribute('slot', 'headline');
    headline.textContent = text;
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'subpage-radio-badge';
      badgeEl.textContent = badge;
      headline.append(' ', badgeEl);
    }
    return headline;
  };

  const makeSupporting = (text?: string): HTMLElement | null => {
    if (!text) return null;
    const supporting = document.createElement('span');
    supporting.setAttribute('slot', 'supporting');
    supporting.className = 'supporting-text';
    supporting.textContent = text;
    return supporting;
  };

  const makeSwitch = (id: string, selected: boolean, label: string): HTMLElement & { selected: boolean } => {
    const sw = document.createElement('md-switch') as HTMLElement & { selected: boolean };
    sw.setAttribute('slot', 'trailing');
    sw.setAttribute('icons', '');
    sw.id = id;
    sw.selected = selected;
    sw.setAttribute('aria-label', label);
    return sw;
  };

  if (config.masterToggle) {
    const mt = config.masterToggle;
    const container = overlay.querySelector('#subpage-master-container');
    if (container) {
      const row = document.createElement('sp-settings-row');
      row.id = 'subpage-master-card';
      row.setAttribute('variant', 'toggle');
      row.className = `subpage-master-item${masterEnabled ? ' subpage-master-item--active' : ''}`;
      const headline = document.createElement('span');
      headline.setAttribute('slot', 'headline');
      headline.textContent = mt.title;
      row.append(headline);
      const supporting = makeSupporting(mt.description);
      if (supporting) row.append(supporting);
      row.append(makeSwitch('subpage-master-switch', masterEnabled, mt.title));
      container.append(row);
    }
  }

  config.groups.forEach((group, gIdx) => {
    const section = overlay.querySelector(`#subpage-group-${gIdx}`);
    if (!section) return;

    group.items.forEach((item, iIdx) => {
      if (item.type === 'custom') {
        const host = document.createElement('div');
        host.className = 'subpage-custom-item';
        host.id = `subpage-custom-${gIdx}-${iIdx}`;
        section.append(host);
        return;
      }

      const row = document.createElement('sp-settings-row');
      row.id = `${item.id}-row`;

      if (item.type === 'radio') {
        row.setAttribute('variant', 'custom');
        row.className = 'subpage-radio-row';
        const radio = document.createElement('md-radio');
        radio.setAttribute('slot', 'leading');
        radio.setAttribute('name', item.name);
        radio.setAttribute('value', item.value);
        radio.id = item.id;
        (radio as HTMLElement & { checked: boolean }).checked = !!item.selected;
        radio.setAttribute('aria-label', `${item.title}${item.badge ? `, ${item.badge}` : ''}`);
        row.append(radio, makeHeadline(item.title, item.badge));
        const supporting = makeSupporting(item.description);
        if (supporting) row.append(supporting);
        row.setAttribute('data-radio-group', item.name);
        row.setAttribute('data-radio-value', item.value);
        section.append(row);
        return;
      }

      if (item.type === 'input') {
        const block = item.layout === 'block';
        row.setAttribute('variant', 'custom');
        row.className = block ? 'subpage-input-row subpage-input-row--block' : 'subpage-input-row';
        if (block) row.setAttribute('stacked', '');
        const icon = makeIcon(item.icon);
        if (icon) row.append(icon);
        row.append(makeHeadline(item.title));
        const supporting = makeSupporting(item.description);
        if (supporting) {
          supporting.id = `${item.id}-desc`;
          row.append(supporting);
        }

        const wrapper = document.createElement('div');
        wrapper.className = block
          ? 'subpage-input-wrapper subpage-input-wrapper--block'
          : 'subpage-input-wrapper';
        wrapper.setAttribute('slot', 'trailing');
        const input = document.createElement('input');
        input.type = item.inputType || 'number';
        input.id = item.id;
        input.className = [
          'subpage-inline-input',
          block ? 'subpage-inline-input--block' : '',
          item.mono ? 'subpage-inline-input--mono' : '',
        ]
          .filter(Boolean)
          .join(' ');
        input.value = inputValues.get(item.id) ?? item.value ?? '';
        if (item.min !== undefined) input.min = String(item.min);
        if (item.max !== undefined) input.max = String(item.max);
        if (item.step !== undefined) input.step = String(item.step);
        if (item.placeholder !== undefined) input.placeholder = item.placeholder;
        if (item.maxLength !== undefined) input.maxLength = item.maxLength;
        if (item.autocapitalize) input.setAttribute('autocapitalize', item.autocapitalize);
        if (item.autocomplete) input.setAttribute('autocomplete', item.autocomplete);
        if (item.spellcheck !== undefined) input.spellcheck = item.spellcheck;
        input.setAttribute('aria-label', item.ariaLabel || item.title);
        if (supporting) input.setAttribute('aria-describedby', supporting.id);
        wrapper.append(input);
        if (item.unit) {
          const unit = document.createElement('span');
          unit.className = 'subpage-input-unit';
          unit.textContent = item.unit;
          wrapper.append(unit);
        }
        row.append(wrapper);
        section.append(row);
        return;
      }

      const swItem = item as SubPageSwitchItem;
      row.setAttribute('variant', 'toggle');
      const icon = makeIcon(swItem.icon);
      if (icon) row.append(icon);
      row.append(makeHeadline(swItem.title));
      const supporting = makeSupporting(swItem.description);
      if (supporting) row.append(supporting);
      row.append(makeSwitch(swItem.id, switchValues.get(swItem.key) ?? true, swItem.title));
      section.append(row);
    });

    // Custom renderers replace their host with an sp-settings-row (or keep
    // plain content inside it); the section owns positioning either way, so
    // no legacy position classes are handed out here anymore.
    group.items.forEach((item, iIdx) => {
      if (item.type !== 'custom') return;
      const host = overlay.querySelector(`#subpage-custom-${gIdx}-${iIdx}`) as HTMLElement | null;
      if (host) item.render(host, () => masterEnabled);
    });
  });

  // History and Back navigation setup
  let closed = false;
  let cleanupA11y = () => {};
  function closeOverlay() {
    if (closed) return;
    closed = true;
    cleanupA11y();
    window.removeEventListener('popstate', onPopState);
    overlay.classList.remove('subpage-overlay--open');
    const hasRemaining = document.querySelectorAll('.subpage-overlay--open').length > 0;
    if (!hasRemaining) {
      window.isOverlayOpen = false;
      document.documentElement.style.overflow = '';
    }
    config.onClose?.();
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function onPopState(e: PopStateEvent) {
    if (e.state && (e.state.subpage === config.id || e.state.subpage === 'file-browser')) {
      return;
    }
    closeOverlay();
  }

  function requestBack() {
    if (closed) return;
    if (history.state && history.state.subpage === config.id) history.back();
    else closeOverlay();
  }

  cleanupA11y = setupOverlayA11y(overlay, {
    titleId: `subpage-title-${config.id}`,
    onClose: closeOverlay,
    initialFocus: overlay.querySelector('.subpage-back-btn'),
  });

  requestAnimationFrame(() => overlay.classList.add('subpage-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ subpage: config.id }, '');
  window.addEventListener('popstate', onPopState);

  overlay.querySelector('#subpage-back')?.addEventListener('click', requestBack);

  // Master switch interaction
  const masterSwitch = overlay.querySelector('#subpage-master-switch') as MdSwitch | null;
  const masterCard = overlay.querySelector('#subpage-master-card') as HTMLElement | null;
  const optionsWrapper = overlay.querySelector('#subpage-options-wrapper') as HTMLElement | null;

  if (masterSwitch && config.masterToggle) {
    const mt = config.masterToggle;
    const onMasterToggle = async (val: boolean) => {
      masterEnabled = val;
      if (mt.setValue) {
        await mt.setValue(masterEnabled);
      } else if (mt.key) {
        cfgSet(mt.key, masterEnabled ? '1' : '0');
      }

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
  }

  // Child switches interactions
  config.groups.forEach(group => {
    group.items.forEach(item => {
      if (!item.type || item.type === 'switch') {
        const swItem = item as SubPageSwitchItem;
        const sw = overlay.querySelector(`#${swItem.id}`) as MdSwitch | null;

        if (sw) {
          sw.addEventListener('change', () => {
            cfgSet(swItem.key, sw.selected ? '1' : '0');
            swItem.onChange?.(sw.selected);
          });
        }
      } else if (item.type === 'radio') {
        const rItem = item as SubPageRadioItem;
        const radio = overlay.querySelector(`#${rItem.id}`) as (HTMLElement & { checked: boolean }) | null;
        const row = overlay.querySelector(`#${rItem.id}-row`) as HTMLElement | null;

        const selectRadio = () => {
          if (!radio) return;
          overlay.querySelectorAll(`md-radio[name="${rItem.name}"]`).forEach(r => {
            (r as HTMLElement & { checked: boolean }).checked = false;
          });
          radio.checked = true;
          rItem.onSelect?.(rItem.value);
        };

        if (radio) {
          radio.addEventListener('change', () => {
            if (radio.checked) selectRadio();
          });
        }

        if (row) {
          row.addEventListener('click', (e) => {
            if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-radio')) return;
            selectRadio();
          });
        }
      } else if (item.type === 'input') {
        const inpItem = item as SubPageInputItem;
        const input = overlay.querySelector(`#${inpItem.id}`) as HTMLInputElement | null;
        if (input) {
          let lastValue = input.value;
          const handleInput = () => {
            if (input.value === lastValue) return;
            lastValue = input.value;
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
    close: requestBack,
    isMasterEnabled: () => masterEnabled,
  };

  if (config.headerAction) {
    const haContainer = overlay.querySelector('#subpage-header-actions') as HTMLElement | null;
    if (haContainer) config.headerAction(haContainer, instance);
  }

  if (config.fab) {
    const fabSlot = overlay.querySelector('#subpage-fab-slot') as HTMLElement | null;
    if (fabSlot) config.fab(fabSlot, instance);
  }

  if (config.footer) {
    const footerEl = overlay.querySelector('#subpage-footer') as HTMLElement | null;
    if (footerEl) config.footer(footerEl, instance);
  }

  (overlay as HTMLElement & { __spInstance?: SubPageInstance }).__spInstance = instance;
  return instance;
}
