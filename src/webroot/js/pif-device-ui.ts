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
import { exec, getDataDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { openFileBrowser } from './file-browser.js';
import { showConfirm } from './dialog.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { afterPaint, escapeHtml, shellEscape } from './utils.js';
import { t, tf } from './i18n.js';
import { refreshPifChooseDesc as refreshChooseDesc } from './pif-choose-desc.js';
import { openSubPage } from './subpage.js';
import { closeMenu, wireMenuTrigger } from './menu-utils.js';

const IMPORTED_PREFIX = 'imported:';

// Keep in sync with src/lib/pif_preferred.sh pif_bot_mirror_urls
const PIF_REPO = 'KOWX712/PlayIntegrityFix';
const pifBotUrls = (path: string): string[] => [
  `https://fastly.jsdelivr.net/gh/${PIF_REPO}@${path}`,
  `https://raw.githubusercontent.com/${PIF_REPO}/${path}`,
  `https://gh.sevencdn.com/https://raw.githubusercontent.com/${PIF_REPO}/${path}`,
];
const DEVICE_LIST_URLS = pifBotUrls('bot/device_list.json');

/** Resolve after two frames, once the disabled FAB and toast have painted. */
function afterNextPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

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

export async function openPifDeviceSubpage() {
  // The page opens immediately on the built-in fallback device list; the
  // saved selection, the imported devices, the blacklist, and the live
  // canary list (a network fetch) load after it is up and re-render the
  // list. Awaiting them first used to freeze the tap, worst on a slow
  // network. State the user changes before the load lands is kept.
  let selectedProduct = '';
  let selectedModel = '';
  let blacklist = new Set<string>();
  let mode: 'target' | 'blacklist' = 'target';
  let imported: PifDevice[] = [];
  let canary: PifDevice[] = FALLBACK_CANARY_DEVICES;
  let searchQuery = '';
  // Target selection and blacklist edits are independent: picking a device
  // must not cause the loaded blacklist to be discarded.
  let targetInteracted = false;
  let blacklistInteracted = false;

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
      // The chosen device may have come from the fallback list before the
      // live list replaced it. Persist its product anyway, using the model
      // remembered at selection time, instead of silently leaving the old
      // preference in place.
      const model = chosen?.model || selectedModel || selectedProduct;
      await cfgSet('pif_preferred_devices', encodePreferred([{ model, product: selectedProduct }]));
      await cfgSet('pif_preferred_product', '');
      await cfgSet('pif_preferred_model', '');
    }
    void refreshChooseDesc();
  };

  const selectProduct = (prod: string, model?: string) => {
    targetInteracted = true;
    selectedProduct = prod;
    selectedModel = prod
      ? (model ?? getAllDevices().find(d => d.product === prod)?.model ?? '')
      : '';
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
    blacklistInteracted = true;
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
    blacklistInteracted = true;
    blacklist.clear();
    updateHeaderFn?.();
    renderLists();
  };

  const renderLists = () => {
    if (!listHostRef) return;
    const { filteredImported, filteredCanary } = getFilteredDevices();
    const q = searchQuery.trim().toLowerCase();

    if (mode === 'target') {
      const randomLabel = t('menu_pif_random', 'Random Canary (Default)');
      const defaultLabel = t('menu_pif_default', 'Default');
      const showRandom =
        !q ||
        'random'.includes(q) ||
        'default'.includes(q) ||
        randomLabel.toLowerCase().includes(q) ||
        defaultLabel.toLowerCase().includes(q);
      const totalFiltered = filteredImported.length + filteredCanary.length + (showRandom ? 1 : 0);

      if (totalFiltered === 0) {
        listHostRef.innerHTML = `
          <div class="pif-device-empty">
            <md-icon aria-hidden="true">search_off</md-icon>
            <p>${escapeHtml(searchQuery ? tf('menu_pif_no_match', 'No devices matching "{0}"', searchQuery) : t('menu_pif_choose_empty', 'No devices found'))}</p>
          </div>
        `;
        return;
      }

      let html = '';

      if (showRandom) {
        const isChecked = selectedProduct === '';
        const blNotice = blacklist.size > 0
          ? ' ' + tf('menu_pif_random_excluded', '({0} excluded by blacklist)', String(blacklist.size))
          : '';
        html += `
          <h2 class="list-title">${escapeHtml(defaultLabel)}</h2>
          <sp-settings-section>
            <sp-settings-row class="pif-device-row" data-product="" variant="navigation">
              <md-radio slot="leading" name="pif-device" value="" ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(randomLabel)}"></md-radio>
              <span slot="headline">${escapeHtml(randomLabel)}</span>
              <span slot="supporting">${escapeHtml(t('menu_pif_random_desc', 'Randomly emulate any Pixel Canary model') + blNotice)}</span>
            </sp-settings-row>
          </sp-settings-section>
        `;
      }

      const renderGroup = (title: string, list: PifDevice[]) => {
        if (list.length === 0) return '';
        const itemsHtml = list
          .map(d => {
            const isChecked = selectedProduct === d.product;
            const isGreyedOut = selectedProduct === '' && blacklist.has(d.product);
            const greyClass = isGreyedOut ? ' pif-device-row--blacklisted' : '';
            const subText = d.imported
              ? t('menu_pif_choose_imported', 'Imported')
              : d.product;
            const trash = d.imported
              ? `<md-icon-button slot="trailing" class="pif-dev-trash" data-id="${escapeHtml(
                  d.product.slice(IMPORTED_PREFIX.length)
                )}" aria-label="${escapeHtml(t('menu_pif_choose_delete', 'Remove imported device'))}">
                  <md-icon aria-hidden="true">delete</md-icon>
                </md-icon-button>`
              : '';

            return `
              <sp-settings-row class="pif-device-row${greyClass}" data-product="${escapeHtml(d.product)}" variant="navigation">
                <md-radio slot="leading" name="pif-device" value="${escapeHtml(d.product)}" ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(d.model)}"></md-radio>
                <span slot="headline">${escapeHtml(d.model)}</span>
                <span slot="supporting">${escapeHtml(subText)}</span>
                ${trash}
              </sp-settings-row>
            `;
          })
          .join('');

        return `
          <h2 class="list-title">${escapeHtml(title)} (${list.length})</h2>
          <sp-settings-section>
            ${itemsHtml}
          </sp-settings-section>
        `;
      };

      if (filteredImported.length > 0) {
        html += renderGroup(t('menu_pif_choose_imported', 'Imported Devices'), filteredImported);
      }
      if (filteredCanary.length > 0) {
        html += renderGroup(t('menu_pif_canary', 'Pixel Canary'), filteredCanary);
      }

      listHostRef.innerHTML = html;

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

        row.addEventListener('sp-activate', handleTrigger);
      });

      // Wire trash buttons
      listHostRef.querySelectorAll<HTMLElement>('.pif-dev-trash').forEach(btn => {
        btn.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const id = btn.dataset.id;
          if (!id) return;
          const ok = await showConfirm(
            t('menu_pif_choose_delete', 'Remove imported device'),
            t('menu_pif_choose_delete', 'Remove imported device') + '?',
            { variant: 'danger' }
          );
          if (!ok) return;

          targetInteracted = true;
          const product = IMPORTED_PREFIX + id;
          const path = `${importedDir()}/${id}.prop`;
          await exec(`rm -f ${shellEscape(path)} 2>/dev/null || true`);
          if (selectedProduct === product) {
            selectedProduct = '';
            selectedModel = '';
          }
          if (blacklist.has(product)) {
            blacklistInteracted = true;
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
            <p>${escapeHtml(searchQuery ? tf('menu_pif_no_match', 'No devices matching "{0}"', searchQuery) : t('menu_pif_choose_empty', 'No devices found'))}</p>
          </div>
        `;
        return;
      }

      let html = '';

      const renderBlacklistGroup = (title: string, list: PifDevice[]) => {
        if (list.length === 0) return '';
        const itemsHtml = list
          .map(d => {
            const isBlacklisted = blacklist.has(d.product);
            const subText = d.imported
              ? t('menu_pif_choose_imported', 'Imported')
              : d.product;
            const excludedClass = isBlacklisted ? ' pif-blacklist-row--excluded' : '';

            return `
              <sp-settings-row class="pif-blacklist-row${excludedClass}" data-product="${escapeHtml(d.product)}" variant="navigation">
                <md-checkbox slot="leading" touch-target="wrapper" data-product="${escapeHtml(d.product)}" ${isBlacklisted ? 'checked' : ''} aria-label="${escapeHtml(d.model)}"></md-checkbox>
                <span slot="headline">${escapeHtml(d.model)}</span>
                <span slot="supporting">${escapeHtml(subText)}</span>
              </sp-settings-row>
            `;
          })
          .join('');

        return `
          <h2 class="list-title">${escapeHtml(title)}</h2>
          <sp-settings-section>
            ${itemsHtml}
          </sp-settings-section>
        `;
      };

      if (filteredImported.length > 0) {
        html += renderBlacklistGroup(t('menu_pif_choose_imported', 'Imported Devices'), filteredImported);
      }
      if (filteredCanary.length > 0) {
        const canaryTitle = blacklist.size > 0
          ? tf('menu_pif_canary_excluded', 'Pixel Canary ({0} excluded)', String(blacklist.size))
          : t('menu_pif_canary', 'Pixel Canary');
        html += renderBlacklistGroup(canaryTitle, filteredCanary);
      }

      listHostRef.innerHTML = html;

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

        row.addEventListener('sp-activate', handleTrigger);
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
    targetInteracted = true;
    selectedProduct = product;
    selectedModel = model;
    imported = imported.filter(d => d.product !== product);
    imported.unshift({ model, product, imported: true });
    renderLists();
    showToast(tf('menu_pif_imported_pending', '{0} imported. Tap Apply to save.', model), {
      icon: 'upload_file',
      type: 'info',
      autoCloseDelay: 2500,
    });
  };

  const pageInstance = await openSubPage({
    id: 'pif-devices',
    title: t('menu_pif_choose', 'Choose PIF Device'),
    description: t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch'),
    headerAction: (container, instance) => {
      container.innerHTML = `
        <div class="pif-menu-wrap">
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
              <div slot="headline" id="pif-menu-reset-text">${escapeHtml(t('menu_pif_reset_random', 'Reset to Random'))}</div>
            </md-menu-item>
          </md-menu>
        </div>
      `;

      const menuBtn = container.querySelector('#pif-menu-btn') as HTMLElement;
      const menu = container.querySelector('#pif-menu') as MdMenu;

      wireMenuTrigger(menuBtn, menu);

      container.querySelector('#pif-menu-import')?.addEventListener('click', () => {
        closeMenu(menu);
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
          if (descEl) descEl.textContent = t('menu_pif_blacklist_desc', 'Checked devices will never be picked when Random Canary is active');
          if (modeIcon) modeIcon.textContent = 'devices';
          if (modeText) modeText.textContent = t('ta_edit_target', 'Choose target device');
          const clearLabel = t('menu_pif_clear_blacklist', 'Clear blacklist');
          if (resetText) resetText.textContent = blacklist.size > 0 ? `${clearLabel} (${blacklist.size})` : clearLabel;
        } else {
          if (titleEl) titleEl.textContent = t('menu_pif_choose', 'Choose PIF Device');
          if (descEl) descEl.textContent = t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch');
          if (modeIcon) modeIcon.textContent = 'block';
          const editLabel = t('ta_edit_blacklist', 'Edit blacklist');
          if (modeText) modeText.textContent = blacklist.size > 0 ? `${editLabel} (${blacklist.size})` : editLabel;
          if (resetText) resetText.textContent = t('menu_pif_reset_random', 'Reset to Random');
        }
      };

      container.querySelector('#pif-menu-mode')?.addEventListener('click', () => {
        closeMenu(menu);
        mode = mode === 'target' ? 'blacklist' : 'target';
        updateHeaderFn?.();
        renderLists();
      });

      container.querySelector('#pif-menu-reset')?.addEventListener('click', () => {
        closeMenu(menu);
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
        <md-fab id="pif-apply" class="subpage-fab" disabled label="${t('dialog_apply', 'Apply')}">
          <md-icon slot="icon" aria-hidden="true">check</md-icon>
        </md-fab>
      `;

      const applyBtn = container.querySelector('#pif-apply') as HTMLButtonElement | null;
      applyBtn?.addEventListener('click', async () => {
        if (applyBtn.disabled) return;
        applyBtn.disabled = true;
        const loadingToast = showLoadingToast(t('common_loading', 'Loading...'));
        await afterNextPaint();
        try {
          await Promise.all([
            persistTarget(),
            saveBlacklist(blacklist, getAllDevices()),
          ]);
          void refreshChooseDesc();
          updateHeaderFn?.();
          renderLists();

          if (mode === 'blacklist') {
            updateToast(
              loadingToast,
              blacklist.size > 0
                ? tf('menu_pif_blacklist_saved_count', 'Blacklist saved ({0} excluded)', String(blacklist.size))
                : t('menu_pif_blacklist_saved_all', 'Blacklist saved (all allowed)'),
              { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 }
            );
          } else {
            const all = getAllDevices();
            const chosen = all.find(d => d.product === selectedProduct);
            const label = selectedProduct
              ? (chosen?.model || selectedModel || selectedProduct)
              : t('menu_pif_random', 'Random Canary (Default)');
            updateToast(loadingToast, tf('menu_pif_applied', '{0} applied', label), {
              icon: 'check_circle',
              type: 'success',
              autoCloseDelay: 2000,
            });
          }
        } catch (e) {
          updateToast(loadingToast, tf('menu_pif_apply_failed', 'Failed to apply: {0}', String(e)), {
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
                    <md-icon-button slot="trailing-icon" id="pif-search-clear" hidden aria-label="${escapeHtml(t('menu_pif_search_clear', 'Clear search'))}">
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
                  clearBtnRef.toggleAttribute('hidden', !searchQuery);
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

  // The page is already open on the fallback list; let it paint before
  // the loads start so they cannot block the page's first frame.
  await new Promise<void>(resolve => afterPaint(resolve, 300));

  // Now load the real state and re-render. Selection and blacklist are
  // only applied when the user has not already changed them.
  const [saved, loadedImported, loadedCanary, loadedBlacklist] = await Promise.all([
    loadPreferred(),
    loadImported(),
    ensureCanaryList(),
    loadBlacklist(),
  ]);
  const pendingImported = imported;
  imported = [
    ...pendingImported,
    ...loadedImported.filter(d => !pendingImported.some(p => p.product === d.product)),
  ];
  canary = loadedCanary;
  if (!targetInteracted) {
    selectedProduct = saved[0]?.product || '';
    selectedModel = saved[0]?.model || '';
  }
  // A saved blacklist still loads when only the target was touched (or a
  // file was imported); explicit blacklist edits keep the user's state.
  if (!blacklistInteracted) {
    blacklist = loadedBlacklist;
  }
  (updateHeaderFn as (() => void) | null)?.();
  renderLists();
  pageInstance.overlay.querySelector('#pif-apply')?.removeAttribute('disabled');
}

export async function wirePifDevice() {
  const row = document.getElementById('pif-choose-device');
  if (!row) return;
  row.hidden = false;
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
