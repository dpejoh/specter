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
  let fileChipEl: HTMLElement | null = null;

  openSubPage({
    id: 'custom-keybox',
    title: t('custom_kb_title', 'Custom Keybox'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-file-picker-item',
            render: (container) => {
              container.innerHTML = `
                <div class="list-item" style="cursor: default; padding: 18px 20px;">
                  <div class="li-icon"><md-icon aria-hidden="true">upload_file</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('custom_kb_file', 'Import File')}</div>
                    <span class="supporting-text" id="kb-file-chip">${selectedFilePath ? selectedFilePath.split('/').pop() : t('custom_kb_file_desc', 'Select a keybox XML file from your device')}</span>
                  </div>
                  <div class="spacer"></div>
                  <md-filled-tonal-button id="kb-browse-btn" style="flex-shrink: 0;">
                    <md-icon slot="icon" aria-hidden="true">folder_open</md-icon>
                    ${t('custom_kb_browse', 'Browse')}
                  </md-filled-tonal-button>
                  <md-ripple></md-ripple>
                </div>
              `;

              fileChipEl = container.querySelector('#kb-file-chip');
              const browseBtn = container.querySelector('#kb-browse-btn');

              const onPick = () => {
                openFileBrowser((filePath: string) => {
                  selectedFilePath = filePath;
                  if (fileChipEl) fileChipEl.textContent = filePath.split('/').pop() || filePath;
                  if (urlInputEl) urlInputEl.value = filePath;
                });
              };

              browseBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                onPick();
              });
              container.querySelector('.list-item')?.addEventListener('click', onPick);
            },
          },
        ],
      },
      {
        items: [
          {
            type: 'custom',
            id: 'kb-url-path-item',
            render: (container) => {
              container.innerHTML = `
                <div class="list-item" style="flex-direction: column; align-items: stretch; gap: 10px; cursor: default; padding: 18px 20px;">
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
                if (fileChipEl) {
                  fileChipEl.textContent = selectedFilePath ? selectedFilePath.split('/').pop() || selectedFilePath : t('custom_kb_no_file', 'No file selected');
                }
              });

              pasteBtn?.addEventListener('click', async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && urlInputEl) {
                    urlInputEl.value = text.trim();
                    selectedFilePath = text.trim();
                    if (fileChipEl) {
                      fileChipEl.textContent = selectedFilePath.split('/').pop() || selectedFilePath;
                    }
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
    footer: (footerContainer, instance) => {
      footerContainer.innerHTML = `
        <md-text-button id="kb-clear" style="--md-text-button-label-text-color: var(--md-sys-color-error);">
          <md-icon slot="icon" aria-hidden="true">delete</md-icon>
          ${t('custom_kb_clear', 'Clear')}
        </md-text-button>
        <md-filled-button id="kb-apply">
          <md-icon slot="icon" aria-hidden="true">check</md-icon>
          ${t('custom_kb_apply', 'Apply')}
        </md-filled-button>
      `;

      const clearBtn = footerContainer.querySelector('#kb-clear') as HTMLButtonElement;
      const applyBtn = footerContainer.querySelector('#kb-apply') as HTMLButtonElement;

      clearBtn?.addEventListener('click', async () => {
        cfgSet('keybox_custom_type', '');
        cfgSet('keybox_custom_value', '');
        cfgSet('keybox_private', '');
        if (urlInputEl) urlInputEl.value = '';
        if (fileChipEl) fileChipEl.textContent = t('custom_kb_file_desc', 'Select a keybox XML file from your device');
        showToast(t('custom_kb_cleared', 'Custom keybox cleared'), { icon: 'info', type: 'info', autoCloseDelay: 2500 });
        instance.close();
      });

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
    infoCard: {
      icon: 'info',
      title: t('custom_kb_title', 'Custom Keybox'),
      text: t(
        'custom_kb_info_desc',
        'Custom keybox files should be valid Key Provider XML files. Installing a custom keybox writes the file directly to your keystore and restarts the keybox provider.'
      ),
    },
  });
}
