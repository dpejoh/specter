import { getModuleDir, exec } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { shellEscape, fetchJson } from './utils.js';
import { showToast } from './toast.js';
import { openFileBrowser } from './file-browser.js';
import { refreshKeyboxStatus } from './device.js';
import { API_URLS } from './constants.js';
import { runAction } from './actions.js';
import { openSubPage } from './subpage.js';
import type { MdSwitch } from '@material/web/switch/switch.js';

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
    select.addEventListener('change', () => { cfgSet('keybox_provider', select.value); });
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
      cfgSet('keybox_custom_type', '');
      cfgSet('keybox_custom_value', '');
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
  const [existingVal] = await Promise.all([
    cfgGet('keybox_custom_value', ''),
  ]);

  let selectedFilePath = existingVal || '';
  let urlInputEl: HTMLInputElement | null = null;
  let fileSubtitleEl: HTMLElement | null = null;
  let fileIconEl: HTMLElement | null = null;

  const updateFileUI = (val: string) => {
    if (fileSubtitleEl) {
      if (val) {
        fileSubtitleEl.textContent = val.split('/').pop() || val;
        fileSubtitleEl.style.color = 'var(--md-sys-color-primary)';
        fileSubtitleEl.style.fontWeight = '500';
      } else {
        fileSubtitleEl.textContent = t('custom_kb_file_desc', 'Select a keybox XML file from your device');
        fileSubtitleEl.style.color = '';
        fileSubtitleEl.style.fontWeight = '';
      }
    }
    if (fileIconEl) {
      fileIconEl.textContent = val ? 'vpn_key' : 'upload_file';
    }
  };

  openSubPage({
    id: 'custom-keybox',
    title: t('custom_kb_title', 'Custom Keybox'),
    headerAction: (container, instance) => {
      container.innerHTML = `
        <md-icon-button id="kb-clear" aria-label="${t('custom_kb_clear', 'Clear')}">
          <md-icon aria-hidden="true">delete_outline</md-icon>
        </md-icon-button>
      `;

      const clearBtn = container.querySelector('#kb-clear') as HTMLElement | null;
      clearBtn?.addEventListener('click', async () => {
        cfgSet('keybox_custom_type', '');
        cfgSet('keybox_custom_value', '');
        cfgSet('keybox_private', '');
        selectedFilePath = '';
        if (urlInputEl) urlInputEl.value = '';
        updateFileUI('');
        showToast(t('custom_kb_cleared', 'Custom keybox cleared'), { icon: 'info', type: 'info', autoCloseDelay: 2500 });
        instance.close();
      });
    },
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-file-picker-item',
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item ${posClass || 'list-item--first'}" id="kb-file-row" style="cursor: pointer; padding: 14px 16px;">
                  <div class="li-icon"><md-icon id="kb-file-icon" aria-hidden="true">${selectedFilePath ? 'vpn_key' : 'upload_file'}</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('custom_kb_file', 'Import File')}</div>
                    <span class="supporting-text" id="kb-file-subtitle" style="${selectedFilePath ? 'color: var(--md-sys-color-primary); font-weight: 500;' : ''}">
                      ${selectedFilePath ? selectedFilePath.split('/').pop() : t('custom_kb_file_desc', 'Select a keybox XML file from your device')}
                    </span>
                  </div>
                  <div class="spacer"></div>
                  <md-filled-tonal-button id="kb-browse-btn" style="flex-shrink: 0; --md-filled-tonal-button-container-shape: 9999px; border-radius: 9999px;">
                    <md-icon slot="icon" aria-hidden="true">folder_open</md-icon>
                    ${t('custom_kb_browse', 'Browse Files')}
                  </md-filled-tonal-button>
                  <md-ripple></md-ripple>
                </div>
              `;

              fileSubtitleEl = container.querySelector('#kb-file-subtitle');
              fileIconEl = container.querySelector('#kb-file-icon');
              const browseBtn = container.querySelector('#kb-browse-btn');
              const fileRow = container.querySelector('#kb-file-row');

              const onPick = () => {
                openFileBrowser((filePath: string) => {
                  selectedFilePath = filePath;
                  updateFileUI(filePath);
                  if (urlInputEl) urlInputEl.value = filePath;
                }, {
                  title: t('fb_internal_storage', 'Internal storage'),
                });
              };

              fileRow?.addEventListener('click', onPick);
              browseBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                onPick();
              });
            },
          },
          {
            type: 'custom',
            id: 'kb-url-path-item',
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item ${posClass || 'list-item--last'}" style="flex-direction: column; align-items: stretch; gap: 8px; cursor: default; padding: 14px 16px;">
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div class="li-icon"><md-icon aria-hidden="true">link</md-icon></div>
                    <div class="list-item-content">
                      <div class="toggle-text">${t('custom_kb_url', 'URL or Path')}</div>
                      <span class="supporting-text">${t('custom_kb_desc', 'Paste a download URL or enter a device path')}</span>
                    </div>
                  </div>
                  <div class="subpage-text-input-wrap">
                    <input
                      type="text"
                      id="kb-url-input"
                      class="subpage-full-input"
                      placeholder="${t('kb_url_placeholder', 'https://example.com/keybox.xml or /sdcard/keybox.xml')}"
                      value="${selectedFilePath}"
                      aria-label="${t('custom_kb_url', 'URL or Path')}"
                    />
                    <md-icon-button id="kb-paste-btn" aria-label="${t('kb_paste_aria', 'Paste from clipboard')}">
                      <md-icon aria-hidden="true">content_paste</md-icon>
                    </md-icon-button>
                  </div>
                </div>
              `;

              urlInputEl = container.querySelector('#kb-url-input');
              const pasteBtn = container.querySelector('#kb-paste-btn');

              urlInputEl?.addEventListener('input', () => {
                selectedFilePath = urlInputEl?.value.trim() || '';
                updateFileUI(selectedFilePath);
              });

              pasteBtn?.addEventListener('click', async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && urlInputEl) {
                    urlInputEl.value = text.trim();
                    selectedFilePath = text.trim();
                    updateFileUI(selectedFilePath);
                  }
                } catch (e) {
                  console.warn('Clipboard read failed:', e);
                }
              });
            },
          },
        ],
      },
      {
        items: [
          {
            id: 'kb-private-switch',
            key: 'keybox_private',
            defaultVal: '0',
            icon: 'lock',
            title: t('custom_kb_private_toggle', 'Private Keybox'),
            description: t('custom_kb_private_desc', 'Hide certificate subject and serial in keybox information'),
          },
        ],
      },
    ],
    fab: (container, instance) => {
      container.innerHTML = `
        <md-fab id="kb-apply" class="subpage-fab" label="${t('custom_kb_apply', 'Apply')}">
          <md-icon slot="icon">check</md-icon>
        </md-fab>
      `;

      const applyBtn = container.querySelector('#kb-apply') as any;
      applyBtn?.addEventListener('click', async () => {
        const text = urlInputEl?.value.trim() || selectedFilePath.trim();

        if (!text) {
          showToast(t('toast_enter_url', 'Enter a URL or device path'), { icon: 'error', type: 'error', autoCloseDelay: 2500 });
          return;
        }

        applyBtn.disabled = true;
        try {
          const pSwitch = instance.overlay.querySelector('#kb-private-switch') as MdSwitch | null;
          if (pSwitch?.selected) {
            cfgSet('keybox_private', 'true');
          } else {
            cfgSet('keybox_private', '');
          }

          if (text.startsWith('http://') || text.startsWith('https://')) {
            cfgSet('keybox_custom_type', 'url');
          } else {
            cfgSet('keybox_custom_type', 'path');
          }
          cfgSet('keybox_custom_value', text);

          const moddir = getModuleDir();
          const result: any = await exec(`sh ${shellEscape(moddir + '/features/keybox.sh')}`);
          if (result.code === 0) {
            showToast(t('custom_kb_installed', 'Custom keybox installed'), { icon: 'check_circle', type: 'success', autoCloseDelay: 3000 });
            await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
            await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
            await refreshKeyboxStatus();
            instance.close();
          } else {
            showToast(t('custom_kb_install_failed', 'Install failed'), { icon: 'error', type: 'error', autoCloseDelay: 5000 });
          }
        } finally {
          applyBtn.disabled = false;
        }
      });
    },
  });
}
