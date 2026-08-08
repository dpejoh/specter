import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import { exec, getDataDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { openFileBrowser } from './file-browser.js';
import { showConfirm } from './dialog.js';
import { showToast } from './toast.js';
import { escapeHtml, shellEscape } from './utils.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

const IMPORTED_PREFIX = 'imported:';

// Keep in sync with src/lib/pif_preferred.sh PIF_BOT_MIRRORS
const DEVICE_LIST_URLS = [
  'https://fastly.jsdelivr.net/gh/KOWX712/PlayIntegrityFix@bot/device_list.json',
  'https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/bot/device_list.json',
  'https://gh.sevencdn.com/https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/bot/device_list.json',
];

type PifDevice = { model: string; product: string; imported?: boolean };

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

let canaryListPromise: Promise<PifDevice[]> | null = null;

async function fetchDeviceListJson(): Promise<PifDevice[]> {
  for (const url of DEVICE_LIST_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      if (!Array.isArray(data)) continue;
      return (data as PifDevice[]).filter(d => d?.model && d?.product);
    } catch {
      /* try next */
    }
  }
  return [];
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

async function refreshChooseDesc() {
  const desc = document.getElementById('pif-choose-device-desc');
  if (!desc) return;
  const preferred = await loadPreferred();
  if (preferred.length === 0) {
    desc.textContent = t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch');
    return;
  }
  if (preferred.length === 1) {
    const label = preferred[0]?.model || preferred[0]?.product || '';
    desc.textContent = t('menu_pif_choose_current', 'Current: {0}').replace('{0}', label);
    return;
  }
  desc.textContent = t('menu_pif_choose_current_many', 'Current: {0} devices').replace(
    '{0}',
    String(preferred.length)
  );
}

async function openPifDeviceDialog() {
  const dialog = document.createElement('md-dialog');
  dialog.className = 'pif-device-dialog';
  dialog.innerHTML = `
    <div slot="headline">${t('menu_pif_choose', 'Choose PIF Device')}</div>
    <div slot="content" class="pif-device-content">
      <div id="pif-device-pane" class="pif-device-pane pif-device-loading" style="height:380px">
        <div class="pif-device-spinner">
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
      </div>
    </div>
    <div slot="actions" class="fb-actions">
      <md-text-button id="pif-dev-add">${t('menu_pif_choose_add_file', 'Add from file')}</md-text-button>
      <div class="spacer"></div>
      <md-text-button id="pif-dev-cancel">${t('dialog_cancel', 'Cancel')}</md-text-button>
      <md-filled-button id="pif-dev-save" disabled>${t('dialog_save', 'Save')}</md-filled-button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.quick = true;
  let closed = false;
  dialog.addEventListener('close', () => {
    closed = true;
    document.body.removeChild(dialog);
  });
  dialog.querySelector('#pif-dev-cancel')!.addEventListener('click', () => dialog.close());

  const savedProducts = new Set<string>();
  let dirty = false;
  let listed: PifDevice[] = [];
  const content = dialog.querySelector('#pif-device-pane') as HTMLElement;
  const saveBtn = dialog.querySelector('#pif-dev-save') as HTMLButtonElement;

  const selectedFromDom = (): PifDevice[] => {
    const checked = new Set(
      Array.from(content.querySelectorAll('input[name="pif-dev"]:checked')).map(
        el => (el as HTMLInputElement).value
      )
    );
    return listed.filter(d => checked.has(d.product));
  };

  const markDirty = () => {
    dirty = true;
    saveBtn.disabled = false;
  };

  const render = (devices: PifDevice[]) => {
    listed = devices;
    content.classList.remove('pif-device-loading');
    const rows = devices.map(d => {
      const badge = d.imported
        ? `<span class="supporting-text">${t('menu_pif_choose_imported', 'Imported')}</span>`
        : `<span class="supporting-text">${escapeHtml(d.product)}</span>`;
      const trash = d.imported
        ? `<md-icon-button class="pif-dev-trash" data-id="${escapeHtml(d.product.slice(IMPORTED_PREFIX.length))}" aria-label="${t('menu_pif_choose_delete', 'Remove imported device')}"><md-icon>delete</md-icon></md-icon-button>`
        : '';
      return `<label class="list-item" style="cursor:pointer">
        <input type="checkbox" name="pif-dev" value="${escapeHtml(d.product)}"${
          savedProducts.has(d.product) ? ' checked' : ''
        } style="margin-inline-end:12px">
        <div class="list-item-content"><div class="toggle-text">${escapeHtml(d.model)}</div>
        ${badge}</div>
        ${trash}
      </label>`;
    });
    content.innerHTML = `
      <p class="ap-dialog-desc">${t('menu_pif_choose_multi_hint', 'Select one or more devices. None selected = random.')}</p>
      ${rows.join('') || `<p class="ap-dialog-desc">${t('menu_pif_choose_empty', 'No devices yet. Add a pif.prop file or wait for the Canary list.')}</p>`}
    `;
    content.querySelectorAll('input[name="pif-dev"]').forEach(el => {
      el.addEventListener('change', markDirty);
    });
    content.querySelectorAll('.pif-dev-trash').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = (el as HTMLElement).dataset.id;
        if (!id) return;
        const product = IMPORTED_PREFIX + id;
        const path = `${importedDir()}/${id}.prop`;
        await exec(`rm -f ${shellEscape(path)} 2>/dev/null || true`);
        savedProducts.delete(product);
        const stored = (await loadPreferred()).filter(d => d.product !== product);
        cfgSet('pif_preferred_devices', encodePreferred(stored));
        render(listed.filter(d => d.product !== product));
        markDirty();
        void refreshChooseDesc();
      });
    });
  };

  const importFile = async (filePath: string) => {
    const { stdout } = await exec(`cat ${shellEscape(filePath)} 2>/dev/null || true`);
    const body = stdout || '';
    const fp = propVal(body, 'FINGERPRINT');
    let model = propVal(body, 'MODEL');
    if (!fp || !model) {
      const ok = await showConfirm(
        t('menu_pif_choose_invalid_title', 'Invalid PIF file'),
        t(
          'menu_pif_choose_invalid_msg',
          'This file is missing FINGERPRINT or MODEL. Import anyway?'
        )
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
    savedProducts.add(product);
    const next = listed.filter(d => d.product !== product);
    next.unshift({ model, product, imported: true });
    render(next);
    markDirty();
  };

  dialog.querySelector('#pif-dev-add')!.addEventListener('click', () => {
    openFileBrowser(path => {
      void importFile(path);
    }, {
      extensions: ['.prop'],
      emptyLabel: t('menu_pif_choose_fb_empty', 'No .prop files found'),
    });
  });

  saveBtn.addEventListener('click', () => {
    if (!dirty) return;
    const picked = selectedFromDom();
    cfgSet('pif_preferred_devices', encodePreferred(picked));
    cfgSet('pif_preferred_product', '');
    cfgSet('pif_preferred_model', '');
    showToast(t('menu_pif_choose_saved', 'PIF device preference saved'), {
      icon: 'check_circle',
      type: 'success',
      autoCloseDelay: 2500,
    });
    refreshChooseDesc();
    dialog.close();
  });

  dialog.show();

  const [saved, imported, canary] = await Promise.all([
    loadPreferred(),
    loadImported(),
    ensureCanaryList(),
  ]);
  if (closed) return;
  for (const d of saved) savedProducts.add(d.product);
  render([...imported, ...canary]);
}

export async function wirePifDevice() {
  const row = document.getElementById('pif-choose-device');
  if (!row) return;
  row.hidden = false;
  void ensureCanaryList();
  row.addEventListener('click', () => {
    void openPifDeviceDialog();
  });
  void refreshChooseDesc();
}
