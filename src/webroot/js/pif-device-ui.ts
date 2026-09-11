import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/radio/radio.js';
import type { MdRadio } from '@material/web/radio/radio.js';
import '@material/web/checkbox/checkbox.js';
import type { MdCheckbox } from '@material/web/checkbox/checkbox.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import type { MdMenu } from '@material/web/menu/menu.js';
import '@material/web/textfield/outlined-text-field.js';
import type { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
import '@material/web/fab/fab.js';
import '@material/web/progress/circular-progress.js';
import { exec, getDataDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { openFileBrowser } from './file-browser.js';
import { showConfirm } from './dialog.js';
import { showToast } from './toast.js';
import { escapeHtml, shellEscape, updateListContainerCorners } from './utils.js';
import { getTranslation } from './i18n.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

const IMPORTED_PREFIX = 'imported:';

// Keep in sync with src/lib/pif_preferred.sh pif_bot_mirror_urls
const PIF_REPO = 'KOWX712/PlayIntegrityFix';
const pifBotUrls = (path: string): string[] => [
  `https://fastly.jsdelivr.net/gh/${PIF_REPO}@${path}`,
  `https://raw.githubusercontent.com/${PIF_REPO}/${path}`,
  `https://gh.sevencdn.com/https://raw.githubusercontent.com/${PIF_REPO}/${path}`,
];
const DEVICE_LIST_URLS = pifBotUrls('bot/device_list.json');

const FALLBACK_CANARY_DEVICES: PifDevice[] = [
  { model: 'Pixel 6', product: 'oriole_beta' },
  { model: 'Pixel 6 Pro', product: 'raven_beta' },
  { model: 'Pixel 6a', product: 'bluejay_beta' },
  { model: 'Pixel 7', product: 'panther_beta' },
  { model: 'Pixel 7 Pro', product: 'cheetah_beta' },
  { model: 'Pixel 7a', product: 'lynx_beta' },
  { model: 'Pixel Fold', product: 'felix_beta' },
  { model: 'Pixel Tablet', product: 'tangorpro_beta' },
  { model: 'Pixel 8', product: 'shiba_beta' },
  { model: 'Pixel 8 Pro', product: 'husky_beta' },
  { model: 'Pixel 8a', product: 'akita_beta' },
  { model: 'Pixel 9', product: 'tokay_beta' },
  { model: 'Pixel 9 Pro', product: 'caiman_beta' },
  { model: 'Pixel 9 Pro XL', product: 'komodo_beta' },
  { model: 'Pixel 9 Pro Fold', product: 'comet_beta' },
  { model: 'Pixel 9a', product: 'tegu_beta' },
];

export type PifDevice = { model: string; product: string; imported?: boolean };

function importedDir(): string {
  return (getDataDir() || '/data/adb/specter') + '/pif_imported';
}

function propVal(text: string, key: string): string {
  const re = new RegExp('^' + key + '=(.*)$', 'm');
  const m = text.match(re);
  return m?.[1]?.trim() || '';
}

function importId(content: string): string {
  // ponytail: 32-bit content hash — collision overwrites same id; upgrade to sha256 if users hit collisions
  let h = 0;
  for (let i = 0; i < content.length; i++) h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function encodePreferred(devices: PifDevice[]): string {
  return devices.map(d => `${d.model}|${d.product}`).join('\n');
}

function parsePreferred(raw: string): PifDevice[] {
  const out: PifDevice[] = [];
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const i = line.indexOf('|');
    if (i < 0) continue;
    const model = line.slice(0, i);
    const product = line.slice(i + 1);
    if (!product) continue;
    out.push({ model, product, imported: product.startsWith(IMPORTED_PREFIX) });
  }
  return out;
}

async function loadPreferred(): Promise<PifDevice[]> {
  const raw = (await cfgGet('pif_preferred_devices', '')) || '';
  if (raw.trim()) return parsePreferred(raw);
  const product = (await cfgGet('pif_preferred_product', '')) || '';
  const model = (await cfgGet('pif_preferred_model', '')) || '';
  return product ? [{ model, product }] : [];
}

async function loadBlacklist(): Promise<Set<string>> {
  const raw = (await cfgGet('pif_blacklist', '')) || '';
  const set = new Set<string>();
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const prod = line.includes('|') ? line.split('|')[1]?.trim() : line;
    if (prod) set.add(prod);
  }
  return set;
}

async function saveBlacklist(set: Set<string>, allDevices: PifDevice[]): Promise<void> {
  const devices = allDevices.filter(d => set.has(d.product));
  const encoded = encodePreferred(devices);
  await cfgSet('pif_blacklist', encoded);
}

let canaryListPromise: Promise<PifDevice[]> | null = null;

async function fetchDeviceListJson(): Promise<PifDevice[]> {
  for (const url of DEVICE_LIST_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      if (!Array.isArray(data)) continue;
      const filtered = (data as PifDevice[]).filter(d => d?.model && d?.product);
      if (filtered.length > 0) return filtered;
    } catch {
      /* try next */
    }
  }
  return FALLBACK_CANARY_DEVICES;
}

function ensureCanaryList(): Promise<PifDevice[]> {
  if (!canaryListPromise) canaryListPromise = fetchDeviceListJson();
  return canaryListPromise;
}

async function loadImported(): Promise<PifDevice[]> {
  const dir = importedDir();
  const { stdout } = await exec(`ls -1 ${shellEscape(dir)}/*.prop 2>/dev/null || true`);
  const paths = (stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
  const out: PifDevice[] = [];
  for (const path of paths) {
    const base = path.split('/').pop() || '';
    const id = base.replace(/\.prop$/, '');
    if (!id) continue;
    const { stdout: body } = await exec(`cat ${shellEscape(path)} 2>/dev/null || true`);
    const model = propVal(body || '', 'MODEL') || id;
    out.push({ model, product: IMPORTED_PREFIX + id, imported: true });
  }
  return out;
}

export async function refreshChooseDesc() {
  const desc = document.getElementById('pif-choose-device-desc');
  if (!desc) return;
  const [preferred, blacklist] = await Promise.all([loadPreferred(), loadBlacklist()]);
  if (preferred.length === 1) {
    const label = preferred[0]?.model || preferred[0]?.product || '';
    desc.textContent = t('menu_pif_choose_current', 'Current: {0}').replace('{0}', label);
    return;
  }
  if (preferred.length > 1) {
    desc.textContent = t('menu_pif_choose_current_many', 'Current: {0} devices').replace(
      '{0}',
      String(preferred.length)
    );
    return;
  }
  if (blacklist.size > 0) {
    desc.textContent = `Random Canary (${blacklist.size} blacklisted)`;
    return;
  }
  desc.textContent = t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch');
}

export async function openPifDeviceSubpage() {
  const [saved, initialImported, initialCanary, initialBlacklist] = await Promise.all([
    loadPreferred(),
    loadImported(),
    ensureCanaryList(),
    loadBlacklist(),
  ]);

  let selectedProduct = saved[0]?.product || '';
  let blacklist = new Set(initialBlacklist);
  let mode: 'target' | 'blacklist' = 'target';
  let imported = initialImported;
  let canary = initialCanary;
  let searchQuery = '';

  let listHostRef: HTMLElement | null = null;
  let searchFieldRef: MdOutlinedTextField | null = null;
  let clearBtnRef: HTMLElement | null = null;
  let updateHeaderFn: (() => void) | null = null;

  const getAllDevices = (): PifDevice[] => [...imported, ...canary];

  const getFilteredDevices = (): { filteredImported: PifDevice[]; filteredCanary: PifDevice[] } => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return { filteredImported: imported, filteredCanary: canary };
    }
    const match = (d: PifDevice) =>
      d.model.toLowerCase().includes(q) || d.product.toLowerCase().includes(q);
    return {
      filteredImported: imported.filter(match),
      filteredCanary: canary.filter(match),
    };
  };

  const persistTarget = async () => {
    if (!selectedProduct) {
      await cfgSet('pif_preferred_devices', '');
      await cfgSet('pif_preferred_product', '');
      await cfgSet('pif_preferred_model', '');
    } else {
      const all = getAllDevices();
      const chosen = all.find(d => d.product === selectedProduct);
      if (chosen) {
        await cfgSet('pif_preferred_devices', encodePreferred([chosen]));
        await cfgSet('pif_preferred_product', '');
        await cfgSet('pif_preferred_model', '');
      }
    }
    void refreshChooseDesc();
  };

  const selectProduct = (prod: string) => {
    selectedProduct = prod;
    if (!listHostRef) return;
    listHostRef.querySelectorAll<MdRadio>('md-radio[name="pif-device"]').forEach(r => {
      r.checked = r.value === selectedProduct;
    });
    const isRandomActive = selectedProduct === '';
    listHostRef.querySelectorAll<HTMLElement>('.pif-device-row').forEach(row => {
      const product = row.dataset.product ?? '';
      if (!product) return;
      row.classList.toggle('pif-device-row--blacklisted', isRandomActive && blacklist.has(product));
    });
  };

  const toggleBlacklistDevice = (prod: string) => {
    if (blacklist.has(prod)) {
      blacklist.delete(prod);
    } else {
      blacklist.add(prod);
    }
    updateHeaderFn?.();
    renderLists();
  };

  const clearAllBlacklist = () => {
    if (blacklist.size === 0) return;
    blacklist.clear();
    updateHeaderFn?.();
    renderLists();
  };

  const renderLists = () => {
    if (!listHostRef) return;
    const { filteredImported, filteredCanary } = getFilteredDevices();
    const q = searchQuery.trim().toLowerCase();

    if (mode === 'target') {
      const showRandom = !q || 'random'.includes(q) || 'default'.includes(q);
      const totalFiltered = filteredImported.length + filteredCanary.length + (showRandom ? 1 : 0);

      if (totalFiltered === 0) {
        listHostRef.innerHTML = `
          <div class="pif-device-empty">
            <md-icon aria-hidden="true">search_off</md-icon>
            <p>${escapeHtml(searchQuery ? `No devices matching "${searchQuery}"` : t('menu_pif_choose_empty', 'No devices found'))}</p>
          </div>
        `;
        return;
      }

      let html = '';

      if (showRandom) {
        const isChecked = selectedProduct === '';
        const blNotice = blacklist.size > 0
          ? ` (${blacklist.size} excluded by blacklist)`
          : '';
        html += `
          <h2 class="list-title">Default</h2>
          <div class="list-container">
            <div class="list-item list-item--only pif-device-row" data-product="" role="button" tabindex="0">
              <md-radio name="pif-device" value="" ${isChecked ? 'checked' : ''} aria-label="Random Canary (Default)"></md-radio>
              <div class="list-item-content">
                <div class="toggle-text">Random Canary (Default)</div>
                <span class="supporting-text">Randomly emulate any Pixel Canary model${escapeHtml(blNotice)}</span>
              </div>
              <md-ripple></md-ripple>
            </div>
          </div>
        `;
      }

      const renderGroup = (title: string, list: PifDevice[]) => {
        if (list.length === 0) return '';
        const itemsHtml = list
          .map((d, i) => {
            const total = list.length;
            const posClass =
              total === 1
                ? 'list-item--only'
                : i === 0
                ? 'list-item--first'
                : i === total - 1
                ? 'list-item--last'
                : 'list-item--middle';
            const isChecked = selectedProduct === d.product;
            const isGreyedOut = selectedProduct === '' && blacklist.has(d.product);
            const greyClass = isGreyedOut ? ' pif-device-row--blacklisted' : '';
            const subText = d.imported
              ? t('menu_pif_choose_imported', 'Imported')
              : d.product;
            const trash = d.imported
              ? `<md-icon-button class="pif-dev-trash" data-id="${escapeHtml(
                  d.product.slice(IMPORTED_PREFIX.length)
                )}" aria-label="${t('menu_pif_choose_delete', 'Remove imported device')}">
                  <md-icon aria-hidden="true">delete</md-icon>
                </md-icon-button>`
              : '';

            return `
              <div class="list-item ${posClass} pif-device-row${greyClass}" data-product="${escapeHtml(d.product)}" role="button" tabindex="0">
                <md-radio name="pif-device" value="${escapeHtml(d.product)}" ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(d.model)}"></md-radio>
                <div class="list-item-content">
                  <div class="toggle-text">${escapeHtml(d.model)}</div>
                  <span class="supporting-text">${escapeHtml(subText)}</span>
                </div>
                ${trash}
                <md-ripple></md-ripple>
              </div>
            `;
          })
          .join('');

        return `
          <h2 class="list-title">${escapeHtml(title)} (${list.length})</h2>
          <div class="list-container">
            ${itemsHtml}
          </div>
        `;
      };

      if (filteredImported.length > 0) {
        html += renderGroup(t('menu_pif_choose_imported', 'Imported Devices'), filteredImported);
      }
      if (filteredCanary.length > 0) {
        html += renderGroup('Pixel Canary', filteredCanary);
      }

      listHostRef.innerHTML = html;
      updateListContainerCorners();

      // Wire clicks on target rows
      listHostRef.querySelectorAll<HTMLElement>('.pif-device-row').forEach(row => {
        const product = row.dataset.product ?? '';
        const radio = row.querySelector('md-radio') as MdRadio | null;

        radio?.addEventListener('change', () => {
          void selectProduct(radio.value);
        });

        const handleTrigger = (ev: Event) => {
          const target = ev.target as HTMLElement;
          if (target.closest('.pif-dev-trash') || target.closest('md-radio')) return;
          if (radio) radio.checked = true;
          void selectProduct(product);
        };

        row.addEventListener('click', handleTrigger);
        row.addEventListener('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            handleTrigger(ev);
          }
        });
      });

      // Wire trash buttons
      listHostRef.querySelectorAll<HTMLElement>('.pif-dev-trash').forEach(btn => {
        btn.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const id = btn.dataset.id;
          if (!id) return;
          const ok = await showConfirm(
            t('dialog_confirm', 'Confirm'),
            t('menu_pif_choose_delete', 'Remove imported device') + '?'
          );
          if (!ok) return;

          const product = IMPORTED_PREFIX + id;
          const path = `${importedDir()}/${id}.prop`;
          await exec(`rm -f ${shellEscape(path)} 2>/dev/null || true`);
          if (selectedProduct === product) {
            selectedProduct = '';
          }
          if (blacklist.has(product)) {
            blacklist.delete(product);
            await saveBlacklist(blacklist, getAllDevices());
          }
          imported = imported.filter(d => d.product !== product);
          await persistTarget();
          renderLists();
          showToast(t('menu_pif_choose_delete', 'Device removed'), {
            icon: 'delete',
            type: 'info',
            autoCloseDelay: 2000,
          });
        });
      });
    } else {
      // BLACKLIST MODE (Checkboxes)
      const totalFiltered = filteredImported.length + filteredCanary.length;

      if (totalFiltered === 0) {
        listHostRef.innerHTML = `
          <div class="pif-device-empty">
            <md-icon aria-hidden="true">search_off</md-icon>
            <p>${escapeHtml(searchQuery ? `No devices matching "${searchQuery}"` : t('menu_pif_choose_empty', 'No devices found'))}</p>
          </div>
        `;
        return;
      }

      let html = '';

      const renderBlacklistGroup = (title: string, list: PifDevice[]) => {
        if (list.length === 0) return '';
        const itemsHtml = list
          .map((d, i) => {
            const total = list.length;
            const posClass =
              total === 1
                ? 'list-item--only'
                : i === 0
                ? 'list-item--first'
                : i === total - 1
                ? 'list-item--last'
                : 'list-item--middle';
            const isBlacklisted = blacklist.has(d.product);
            const subText = d.imported
              ? t('menu_pif_choose_imported', 'Imported')
              : d.product;
            const excludedClass = isBlacklisted ? ' pif-blacklist-row--excluded' : '';

            return `
              <div class="list-item ${posClass} pif-blacklist-row${excludedClass}" data-product="${escapeHtml(d.product)}" role="button" tabindex="0">
                <md-checkbox touch-target="wrapper" data-product="${escapeHtml(d.product)}" ${isBlacklisted ? 'checked' : ''} aria-label="${escapeHtml(d.model)}"></md-checkbox>
                <div class="list-item-content">
                  <div class="toggle-text">${escapeHtml(d.model)}</div>
                  <span class="supporting-text">${escapeHtml(subText)}</span>
                </div>
                <md-ripple></md-ripple>
              </div>
            `;
          })
          .join('');

        return `
          <h2 class="list-title">${escapeHtml(title)}</h2>
          <div class="list-container">
            ${itemsHtml}
          </div>
        `;
      };

      if (filteredImported.length > 0) {
        html += renderBlacklistGroup(t('menu_pif_choose_imported', 'Imported Devices'), filteredImported);
      }
      if (filteredCanary.length > 0) {
        const canaryTitle = blacklist.size > 0
          ? `Pixel Canary (${blacklist.size} excluded)`
          : 'Pixel Canary';
        html += renderBlacklistGroup(canaryTitle, filteredCanary);
      }

      listHostRef.innerHTML = html;
      updateListContainerCorners();

      // Wire checkbox & row toggles
      listHostRef.querySelectorAll<HTMLElement>('.pif-blacklist-row').forEach(row => {
        const product = row.dataset.product ?? '';
        const checkbox = row.querySelector('md-checkbox') as MdCheckbox | null;

        checkbox?.addEventListener('change', () => {
          void toggleBlacklistDevice(product);
        });

        const handleTrigger = (ev: Event) => {
          const target = ev.target as HTMLElement;
          if (target.closest('md-checkbox')) return;
          if (checkbox) checkbox.checked = !checkbox.checked;
          void toggleBlacklistDevice(product);
        };

        row.addEventListener('click', handleTrigger);
        row.addEventListener('keydown', (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            handleTrigger(ev);
          }
        });
      });
    }
  };

  const importFile = async (filePath: string) => {
    const { stdout } = await exec(`cat ${shellEscape(filePath)} 2>/dev/null || true`);
    const body = stdout || '';
    const fp = propVal(body, 'FINGERPRINT');
    let model = propVal(body, 'MODEL');
    if (!fp || !model) {
      const ok = await showConfirm(
        t('menu_pif_choose_invalid_title', 'Invalid PIF file'),
        t('menu_pif_choose_invalid_msg', 'This file is missing FINGERPRINT or MODEL. Import anyway?')
      );
      if (!ok) return;
      if (!model) {
        const base = filePath.split('/').pop() || 'imported';
        model = base.replace(/\.prop$/i, '') || 'imported';
      }
    }
    const id = importId(body || filePath);
    const dest = `${importedDir()}/${id}.prop`;
    const { code } = await exec(
      `mkdir -p ${shellEscape(importedDir())} && cp ${shellEscape(filePath)} ${shellEscape(dest)}`
    );
    if (code !== 0) {
      showToast(t('menu_pif_choose_import_failed', 'Failed to import file'), {
        icon: 'error',
        type: 'error',
        autoCloseDelay: 2500,
      });
      return;
    }

    const product = IMPORTED_PREFIX + id;
    selectedProduct = product;
    imported = imported.filter(d => d.product !== product);
    imported.unshift({ model, product, imported: true });
    renderLists();
    showToast(`${model} imported. Tap Apply to save.`, {
      icon: 'upload_file',
      type: 'info',
      autoCloseDelay: 2500,
    });
  };

  await openSubPage({
    id: 'pif-devices',
    title: t('menu_pif_choose', 'Choose PIF Device'),
    description: t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch'),
    headerAction: (container, instance) => {
      container.innerHTML = `
        <div style="position: relative; display: flex; align-items: center;">
          <button type="button" class="subpage-action-btn" id="pif-menu-btn" aria-label="${t('ta_menu_more', 'More options')}">
            <md-icon aria-hidden="true">more_vert</md-icon>
            <md-ripple></md-ripple>
          </button>
          <md-menu id="pif-menu" class="pif-menu" anchor="pif-menu-btn" positioning="fixed">
            <md-menu-item id="pif-menu-import" class="first">
              <md-icon slot="start" aria-hidden="true">upload_file</md-icon>
              <div slot="headline">${t('menu_pif_choose_add_file', 'Add from file')}</div>
            </md-menu-item>
            <md-menu-item id="pif-menu-mode">
              <md-icon slot="start" aria-hidden="true" id="pif-menu-mode-icon">block</md-icon>
              <div slot="headline" id="pif-menu-mode-text">${t('ta_edit_blacklist', 'Edit blacklist')}</div>
            </md-menu-item>
            <md-menu-item id="pif-menu-reset" class="last">
              <md-icon slot="start" aria-hidden="true" id="pif-menu-reset-icon">restart_alt</md-icon>
              <div slot="headline" id="pif-menu-reset-text">Reset to Random</div>
            </md-menu-item>
          </md-menu>
        </div>
      `;

      const menuBtn = container.querySelector('#pif-menu-btn') as HTMLElement;
      const menu = container.querySelector('#pif-menu') as MdMenu;

      menuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu) menu.open = !menu.open;
      });

      container.querySelector('#pif-menu-import')?.addEventListener('click', () => {
        if (menu) menu.open = false;
        openFileBrowser(
          path => {
            void importFile(path);
          },
          {
            extensions: ['.prop'],
            emptyLabel: t('menu_pif_choose_fb_empty', 'No .prop files found'),
          }
        );
      });

      updateHeaderFn = () => {
        const titleEl = instance.overlay.querySelector('.subpage-title') as HTMLElement | null;
        const descEl = instance.overlay.querySelector('.subpage-top-desc') as HTMLElement | null;
        const modeIcon = container.querySelector('#pif-menu-mode-icon') as HTMLElement | null;
        const modeText = container.querySelector('#pif-menu-mode-text') as HTMLElement | null;
        const resetText = container.querySelector('#pif-menu-reset-text') as HTMLElement | null;

        if (mode === 'blacklist') {
          if (titleEl) titleEl.textContent = t('bl_title', 'Blacklist');
          if (descEl) descEl.textContent = 'Checked devices will never be picked when Random Canary is active';
          if (modeIcon) modeIcon.textContent = 'devices';
          if (modeText) modeText.textContent = t('ta_edit_target', 'Choose target device');
          if (resetText) resetText.textContent = blacklist.size > 0 ? `Clear blacklist (${blacklist.size})` : 'Clear blacklist';
        } else {
          if (titleEl) titleEl.textContent = t('menu_pif_choose', 'Choose PIF Device');
          if (descEl) descEl.textContent = t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch');
          if (modeIcon) modeIcon.textContent = 'block';
          if (modeText) modeText.textContent = blacklist.size > 0 ? `Edit blacklist (${blacklist.size})` : t('ta_edit_blacklist', 'Edit blacklist');
          if (resetText) resetText.textContent = 'Reset to Random';
        }
      };

      container.querySelector('#pif-menu-mode')?.addEventListener('click', () => {
        if (menu) menu.open = false;
        mode = mode === 'target' ? 'blacklist' : 'target';
        updateHeaderFn?.();
        renderLists();
      });

      container.querySelector('#pif-menu-reset')?.addEventListener('click', () => {
        if (menu) menu.open = false;
        if (mode === 'target') {
          selectProduct('');
          renderLists();
        } else {
          clearAllBlacklist();
        }
      });

      // Intercept back button when in blacklist mode to smoothly return to target mode
      const backBtn = instance.overlay.querySelector('#subpage-back') as HTMLElement | null;
      backBtn?.addEventListener('click', (ev) => {
        if (mode === 'blacklist') {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          mode = 'target';
          updateHeaderFn?.();
          renderLists();
        }
      }, true);
    },
    fab: container => {
      container.innerHTML = `
        <md-fab id="pif-apply" class="subpage-fab" label="${t('dialog_apply', 'Apply')}">
          <md-icon slot="icon" aria-hidden="true">check</md-icon>
        </md-fab>
      `;

      const applyBtn = container.querySelector('#pif-apply') as HTMLButtonElement | null;
      applyBtn?.addEventListener('click', async () => {
        if (applyBtn.disabled) return;
        applyBtn.disabled = true;
        try {
          await Promise.all([
            persistTarget(),
            saveBlacklist(blacklist, getAllDevices()),
          ]);
          void refreshChooseDesc();
          updateHeaderFn?.();
          renderLists();

          if (mode === 'blacklist') {
            showToast(
              blacklist.size > 0
                ? `Blacklist saved (${blacklist.size} excluded)`
                : 'Blacklist saved (all allowed)',
              { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 }
            );
          } else {
            const all = getAllDevices();
            const chosen = all.find(d => d.product === selectedProduct);
            const label = chosen?.model || 'Random Canary (Default)';
            showToast(`${label} applied`, {
              icon: 'check_circle',
              type: 'success',
              autoCloseDelay: 2000,
            });
          }
        } catch (e) {
          showToast(`Failed to apply: ${e}`, {
            icon: 'error',
            type: 'error',
            autoCloseDelay: 2500,
          });
        } finally {
          applyBtn.disabled = false;
        }
      });
    },
    groups: [
      {
        items: [
          {
            type: 'custom',
            render: host => {
              host.className = 'pif-subpage-wrapper';
              host.innerHTML = `
                <div class="pif-search-container">
                  <md-outlined-text-field
                    id="pif-search"
                    class="pif-search"
                    placeholder="${t('menu_pif_search', 'Search devices...')}"
                    aria-label="${t('menu_pif_search', 'Search devices...')}"
                  >
                    <md-icon slot="leading-icon" aria-hidden="true">search</md-icon>
                    <md-icon-button slot="trailing-icon" id="pif-search-clear" style="display:none;" aria-label="Clear search">
                      <md-icon aria-hidden="true">close</md-icon>
                    </md-icon-button>
                  </md-outlined-text-field>
                </div>
                <div id="pif-devices-list-host"></div>
              `;

              listHostRef = host.querySelector('#pif-devices-list-host');
              searchFieldRef = host.querySelector('#pif-search') as MdOutlinedTextField | null;
              clearBtnRef = host.querySelector('#pif-search-clear');

              searchFieldRef?.addEventListener('input', () => {
                searchQuery = searchFieldRef?.value || '';
                if (clearBtnRef) {
                  clearBtnRef.style.display = searchQuery ? 'inline-flex' : 'none';
                }
                renderLists();
              });

              clearBtnRef?.addEventListener('click', () => {
                if (searchFieldRef) searchFieldRef.value = '';
                searchQuery = '';
                if (clearBtnRef) clearBtnRef.style.display = 'none';
                renderLists();
              });
              renderLists();
            },
          },
        ],
      },
    ],
  });
}

export async function wirePifDevice() {
  const row = document.getElementById('pif-choose-device');
  if (!row) return;
  row.hidden = false;
  updateListContainerCorners();
  void ensureCanaryList();
  row.addEventListener('click', () => {
    void openPifDeviceSubpage();
  });
  row.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      void openPifDeviceSubpage();
    }
  });
  void refreshChooseDesc();
}
