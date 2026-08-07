import '@material/web/button/filled-button.js';
import { exec } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { PIF_DIR } from './constants.js';
import { showToast } from './toast.js';
import { escapeHtml, shellEscape } from './utils.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

type PifDevice = { model: string; product: string };

function parseDeviceList(stdout: string): PifDevice[] {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  const data = JSON.parse(stdout.slice(start, end + 1)) as { model?: string[]; product?: string[] };
  const models = data.model || [];
  const products = data.product || [];
  const n = Math.min(models.length, products.length);
  const out: PifDevice[] = [];
  for (let i = 0; i < n; i++) {
    const model = models[i];
    const product = products[i];
    if (model && product) out.push({ model, product });
  }
  return out;
}

function encodePreferred(devices: PifDevice[]): string {
  return devices.map(d => `${d.model}|${d.product}`).join('\n');
}

function parsePreferred(raw: string): PifDevice[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const i = line.indexOf('|');
      if (i < 0) return null;
      return { model: line.slice(0, i), product: line.slice(i + 1) };
    })
    .filter((d): d is PifDevice => !!d?.product);
}

async function loadPreferred(): Promise<PifDevice[]> {
  const raw = (await cfgGet('pif_preferred_devices', '')) || '';
  if (raw.trim()) return parsePreferred(raw);
  const product = (await cfgGet('pif_preferred_product', '')) || '';
  const model = (await cfgGet('pif_preferred_model', '')) || '';
  return product ? [{ model, product }] : [];
}

async function isInjectInstalled(): Promise<boolean> {
  const { stdout } = await exec(
    `grep '^name=' ${shellEscape(PIF_DIR + '/module.prop')} 2>/dev/null || true`
  );
  return /INJECT/i.test(stdout || '');
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
  dialog.innerHTML = `
    <div slot="headline">${t('menu_pif_choose', 'Choose PIF Device')}</div>
    <div slot="content" id="pif-device-content" style="min-height:120px;max-height:50vh;overflow:auto">
      <p class="ap-dialog-desc">${t('menu_pif_choose_loading', 'Loading device list…')}</p>
    </div>
    <div slot="actions">
      <md-text-button id="pif-dev-cancel">${t('dialog_cancel', 'Cancel')}</md-text-button>
      <md-filled-button id="pif-dev-save" disabled>${t('dialog_save', 'Save')}</md-filled-button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.querySelector('#pif-dev-cancel')!.addEventListener('click', () => dialog.close());

  const saved = await loadPreferred();
  const savedProducts = new Set(saved.map(d => d.product));
  let dirty = false;
  let listed: PifDevice[] = [];
  const content = dialog.querySelector('#pif-device-content') as HTMLElement;
  const saveBtn = dialog.querySelector('#pif-dev-save') as HTMLButtonElement;

  const selectedFromDom = (): PifDevice[] => {
    const checked = new Set(
      Array.from(content.querySelectorAll('input[name="pif-dev"]:checked')).map(
        el => (el as HTMLInputElement).value
      )
    );
    return listed.filter(d => checked.has(d.product));
  };

  const render = (devices: PifDevice[]) => {
    listed = devices;
    const rows = devices.map(
      d => `<label class="list-item" style="cursor:pointer">
        <input type="checkbox" name="pif-dev" value="${escapeHtml(d.product)}"${
          savedProducts.has(d.product) ? ' checked' : ''
        } style="margin-inline-end:12px">
        <div class="list-item-content"><div class="toggle-text">${escapeHtml(d.model)}</div>
        <span class="supporting-text">${escapeHtml(d.product)}</span></div>
      </label>`
    );
    content.innerHTML = `
      <p class="ap-dialog-desc">${t('menu_pif_choose_multi_hint', 'Select one or more devices. None selected = random.')}</p>
      ${rows.join('')}
    `;
    content.querySelectorAll('input[name="pif-dev"]').forEach(el => {
      el.addEventListener('change', () => {
        dirty = true;
        saveBtn.disabled = false;
      });
    });
  };

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

  try {
    const { stdout } = await exec(`sh ${shellEscape(PIF_DIR + '/autopif.sh')} --list 2>/dev/null`);
    const devices = parseDeviceList(stdout || '');
    if (devices.length === 0) throw new Error('empty');
    render(devices);
  } catch {
    content.innerHTML = `<p class="ap-dialog-desc">${t('menu_pif_choose_failed', 'Failed to load device list')}</p>`;
  }
}

export async function wirePifDevice() {
  const row = document.getElementById('pif-choose-device');
  if (!row) return;
  if (!(await isInjectInstalled())) return;
  row.hidden = false;
  await refreshChooseDesc();
  row.addEventListener('click', () => openPifDeviceDialog());
}
