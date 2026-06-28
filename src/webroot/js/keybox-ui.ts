import { getModuleDir, exec } from './bridge.js';
import { cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { shellEscape, fetchJson } from './utils.js';
import { showToast } from './toast.js';
import { openFileBrowser } from './file-browser.js';
import { refreshKeyboxStatus } from './device.js';
import { API_URLS } from './constants.js';
import { runAction } from './actions.js';

import type { CatalogJson } from './types.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

function renderProviderOptions(select: HTMLSelectElement, sources: string[]) {
  while (select.options.length > 1) select.remove(1);
  for (const s of sources) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  }
}

const providerSelects = new WeakSet<HTMLSelectElement>();

async function fetchCatalog(): Promise<CatalogJson | null> {
  const url = API_URLS.KEY_CATALOG!;
  const data = await fetchJson<CatalogJson>(url, 300000).catch(() => null);
  if (data?.entries) return data;
  if (typeof exec !== 'function') return null;
  try {
    const res = await exec(`curl -sfL --connect-timeout 10 ${shellEscape(url)}`);
    return JSON.parse(res.stdout) as CatalogJson;
  } catch {
    return null;
  }
}

export async function populateProviders() {
  const select = document.getElementById('kb-provider') as HTMLSelectElement | null;
  if (!select) return;

  if (!providerSelects.has(select)) {
    providerSelects.add(select);
    select.addEventListener('change', () => { cfgSet('kb_provider', select.value); });
  }

  const data = await fetchCatalog();
  if (data?.entries) {
    const sources = [...new Set(data.entries.map(e => e.source))].sort();
    const currentValue = select.value;
    renderProviderOptions(select, sources);
    select.value = currentValue;
  }
}

export function wireCustomKeybox() {
  const btn = document.getElementById('custom-keybox-btn');
  if (!btn) return;
  btn.addEventListener('click', openCustomKeyboxDialog);
}

export function wireKeyboxInstallButton() {
  const btn = document.getElementById('kb-install-btn') as MdFilledButton | null;
  const card = document.querySelector('.keybox-install-card');
  const spinner = card?.querySelector('.kic-spinner') as HTMLElement | null;
  if (!btn) return;

  btn.addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    if (btn.disabled) return;

    btn.disabled = true;
    spinner?.classList.remove('hidden');

    try {
      cfgSet('kb_custom_type', '');
      cfgSet('kb_custom_value', '');
      await runAction('keybox.sh');
      const moddir = getModuleDir();
      if (moddir) {
        await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
        await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
      }
      await refreshKeyboxStatus();
    } catch (_e) {
      console.warn('Install error:', _e);
    } finally {
      btn.disabled = false;
      spinner?.classList.add('hidden');
    }
  });
}

export async function openCustomKeyboxDialog() {

  const dialog = document.createElement('md-dialog');

  dialog.innerHTML = `
    <div slot="headline" style="padding:20px 24px 4px">${t('custom_kb_title', 'Custom Keybox')}</div>
    <div slot="content" style="padding:4px 24px">
      <md-filled-card style="padding:12px;border-radius:14px;width:100%;box-sizing:border-box;--md-filled-card-container-color:var(--md-sys-color-surface-container-highest)">
        <div class="custom-kb-section">
          <div class="li-icon"><md-icon>upload_file</md-icon></div>
          <p style="margin:6px 0 2px;font-size:0.8125rem">${t('custom_kb_file', 'Import File')}</p>
            <p style="margin:0 0 8px;font-size:0.6875rem;color:var(--md-sys-color-on-surface-variant)">
              ${t('custom_kb_file_desc', 'Select a keybox XML file from your device')}
            </p>
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <md-assist-chip id="kb-file-chip" label="${t('custom_kb_no_file', 'No file selected')}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;flex:1;height:36px;font-size:0.75rem"></md-assist-chip>
            <span class="kb-browse-wrap">
              <md-filled-tonal-button class="kb-browse-textonly" aria-label="${t('custom_kb_browse', 'Browse Files')}">${t('custom_kb_browse', 'Browse')}</md-filled-tonal-button>
              <button class="kb-browse-icononly" aria-label="${t('custom_kb_browse', 'Browse Files')}"><md-icon>folder_open</md-icon></button>
            </span>
          </div>
        </div>
      </md-filled-card>

      <md-filled-card style="padding:12px;border-radius:14px;width:100%;box-sizing:border-box;margin-top:8px;--md-filled-card-container-color:var(--md-sys-color-surface-container-highest)">
        <div class="custom-kb-section">
          <div class="li-icon"><md-icon>link</md-icon></div>
          <p style="margin:6px 0 2px;font-size:0.8125rem">${t('custom_kb_url', 'URL or Path')}</p>
          <p style="margin:0 0 8px;font-size:0.6875rem;color:var(--md-sys-color-on-surface-variant)">
            ${t('custom_kb_desc', 'Paste a download URL or enter a device path')}
          </p>
          <md-outlined-text-field id="kb-url-input" style="width:100%;--md-outlined-text-field-container-shape:14px;--md-sys-shape-corner-extra-small:14px;border-radius:14px;height:44px" placeholder="${t('kb_url_placeholder', 'https://example.com/keybox.xml or /sdcard/keybox.xml')}">
            <md-icon-button slot="trailing-icon" id="kb-paste-btn" aria-label="${t('kb_paste_aria', 'Paste from clipboard')}">
              <md-icon>content_paste</md-icon>
            </md-icon-button>
          </md-outlined-text-field>
        </div>
      </md-filled-card>
    </div>
    <div slot="actions" style="padding:4px 24px 20px">
      <md-text-button id="kb-clear"><md-icon slot="icon">delete</md-icon> ${t('custom_kb_clear', 'Clear')}</md-text-button>
      <div class="spacer"></div>
      <md-filled-tonal-button id="kb-apply">${t('custom_kb_apply', 'Apply')}</md-filled-tonal-button>
    </div>
  `;

  document.body.appendChild(dialog);

  const fileWrap = dialog.querySelector('.kb-browse-wrap');
  const urlInput = dialog.querySelector('#kb-url-input') as MdOutlinedTextField;
  const pasteBtn = dialog.querySelector('#kb-paste-btn');
  const clearBtn = dialog.querySelector('#kb-clear');
  const applyBtn = dialog.querySelector('#kb-apply');

  fileWrap!.addEventListener('click', () => {
    openFileBrowser((filePath: string) => {
      urlInput.value = filePath;
      const chip = dialog.querySelector('#kb-file-chip') as MdAssistChip | null;
      if (chip) chip.label = filePath.split('/').pop() || filePath;
    });
  });

  pasteBtn!.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) urlInput.value = text;
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  });

  clearBtn!.addEventListener('click', async () => {
    cfgSet('kb_custom_type', '');
    cfgSet('kb_custom_value', '');
    cfgSet('kb_private', '');
    showToast(t('custom_kb_cleared', 'Custom keybox cleared'), { icon: 'info', type: 'info', autoCloseDelay: 2500 });
    dialog.close();
  });

  applyBtn!.addEventListener('click', async () => {
    const moddir = getModuleDir();
    const text = urlInput.value.trim();

    if (!text) {
      showToast(t('toast_enter_url', 'Enter a URL or device path'), { icon: 'error', type: 'error', autoCloseDelay: 2500 });
      return;
    }

    const privateChoice = await new Promise<boolean>(resolve => {
      const pd = document.createElement('md-dialog');
      pd.className = 'private-dialog';
      pd.innerHTML = `
        <div slot="headline">${t('custom_kb_title', 'Custom Keybox')}</div>
        <div slot="content">
          <p class="private-dialog-msg">${t('custom_kb_private_ask', 'Is this a private keybox?')}</p>
        </div>
        <div slot="actions">
          <md-text-button id="kb-pri-no" value="no">${t('custom_kb_no', 'No')}</md-text-button>
          <md-text-button id="kb-pri-yes" value="yes">${t('custom_kb_yes', 'Yes')}</md-text-button>
        </div>
      `;
      document.body.appendChild(pd);
      pd.querySelector('#kb-pri-no')!.addEventListener('click', () => { pd.close(); resolve(false); });
      pd.querySelector('#kb-pri-yes')!.addEventListener('click', () => { pd.close(); resolve(true); });
      pd.addEventListener('close', () => document.body.removeChild(pd));
      pd.show();
    });

    if (privateChoice) {
      cfgSet('kb_private', 'true');
    } else {
      cfgSet('kb_private', '');
    }
    if (text.startsWith('http://') || text.startsWith('https://')) {
      cfgSet('kb_custom_type', 'url');
    } else {
      cfgSet('kb_custom_type', 'path');
    }
    cfgSet('kb_custom_value', text);
    const result: any = await exec(`sh ${shellEscape(moddir + '/features/keybox.sh')}`);
    if (result.code === 0) {
      showToast(t('custom_kb_installed', 'Custom keybox installed'), { icon: 'check_circle', type: 'success', autoCloseDelay: 3000 });
      await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
      await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
      await refreshKeyboxStatus();
    } else {
      showToast(t('custom_kb_install_failed', 'Install failed'), { icon: 'error', type: 'error', autoCloseDelay: 5000 });
    }
    dialog.close();
  });

  dialog.addEventListener('close', () => {
    document.body.removeChild(dialog);
  });
  dialog.show();
}
