import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { openSubPage } from './subpage.js';
import { showToast } from './toast.js';
import { exec, getModuleDir } from './bridge.js';
import { escapeHtml, shellEscape } from './utils.js';


export async function openBootHashSubpage() {
  const moddir = getModuleDir();
  const savedCustom = (await cfgGet('custom_boot_hash', '')) || '';

  let activeHash = '';
  try {
    const { stdout } = await exec('resetprop ro.boot.vbmeta.digest 2>/dev/null || true');
    activeHash = stdout.trim();
  } catch {}

  let cachedHash = '';
  try {
    const { stdout } = await exec('cat /data/adb/specter/boot_hash 2>/dev/null || true');
    cachedHash = stdout.trim();
  } catch {}

  let hashInputEl: HTMLInputElement | null = null;
  let activeHashEl: HTMLElement | null = null;
  let cacheHashEl: HTMLElement | null = null;
  let clearCacheBtn: HTMLElement | null = null;

  await openSubPage({
    id: 'boot-hash',
    title: t('boot_hash_title', 'Boot Hash'),
    description: t('boot_hash_subpage_desc', 'Fix ro.boot.vbmeta.digest from TEE'),
    masterToggle: {
      key: 'toggle_boot_hash',
      defaultVal: '1',
      title: t('control_toggle_boot_hash_master', 'Fix Boot Hash'),
      syncSwitchId: 'toggle-boot_hash',
    },
    headerAction: (container) => {
      container.innerHTML = `
        <md-icon-button id="bh-clear-btn" aria-label="${t('dialog_clear', 'Clear')}">
          <md-icon aria-hidden="true">delete_outline</md-icon>
        </md-icon-button>
      `;
      const clearBtn = container.querySelector('#bh-clear-btn') as HTMLElement | null;
      clearBtn?.addEventListener('click', async () => {
        cfgSet('custom_boot_hash', '');
        if (hashInputEl) hashInputEl.value = '';
        if (moddir) {
          await exec(`sh ${shellEscape(moddir + '/features/boot_hash.sh')} --refresh 2>/dev/null || true`);
          try {
            const { stdout: actOut } = await exec('resetprop ro.boot.vbmeta.digest 2>/dev/null || true');
            if (activeHashEl) activeHashEl.textContent = actOut.trim() || t('boot_hash_active_empty', 'None');
          } catch {}
          try {
            const { stdout: cOut } = await exec('cat /data/adb/specter/boot_hash 2>/dev/null || true');
            const cVal = cOut.trim();
            if (cacheHashEl) {
              cacheHashEl.textContent = cVal || t('boot_hash_cache_empty', 'None');
            }
            if (clearCacheBtn) {
              if (cVal) clearCacheBtn.removeAttribute('disabled');
              else clearCacheBtn.setAttribute('disabled', '');
            }
          } catch {}
        }
        showToast(t('boot_hash_cleared', 'Custom hash cleared'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      });
    },
    groups: [
      {
        title: t('boot_hash_group_custom', 'Custom Hash'),
        items: [
          {
            type: 'custom',
            id: 'bh-custom-input-card',
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item bh-card ${posClass || 'list-item--only'}">
                  <div class="bh-row">
                    <div class="li-icon"><md-icon aria-hidden="true">tag</md-icon></div>
                    <div class="list-item-content">
                      <div class="toggle-text">${t('boot_hash_custom_title', 'Custom Hash')}</div>
                      <span class="supporting-text">${t('boot_hash_custom_desc', 'Spoof custom SHA-256 digest')}</span>
                    </div>
                  </div>
                  <div class="subpage-text-input-wrap">
                    <input
                      type="text"
                      id="bh-input"
                      class="subpage-full-input bh-mono"
                      maxlength="64"
                      autocapitalize="none"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="${t('boot_hash_placeholder', 'Empty for auto')}"
                      value="${escapeHtml(savedCustom)}"
                      aria-label="${t('boot_hash_custom_title', 'Custom Hash')}"
                    />
                    <md-icon-button id="bh-paste-btn" aria-label="${t('kb_paste_aria', 'Paste from clipboard')}">
                      <md-icon aria-hidden="true">content_paste</md-icon>
                    </md-icon-button>
                    <md-icon-button id="bh-zero-btn" aria-label="${t('boot_hash_zero_aria', 'Set to zeros')}">
                      <md-icon aria-hidden="true">restart_alt</md-icon>
                    </md-icon-button>
                  </div>
                </div>
              `;

              hashInputEl = container.querySelector('#bh-input');
              const pasteBtn = container.querySelector('#bh-paste-btn');
              const zeroBtn = container.querySelector('#bh-zero-btn');

              pasteBtn?.addEventListener('click', async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && hashInputEl) {
                    hashInputEl.value = text.trim();
                  }
                } catch (e) {
                  console.warn('Clipboard read failed:', e);
                }
              });

              zeroBtn?.addEventListener('click', () => {
                if (hashInputEl) hashInputEl.value = '0'.repeat(64);
              });
            },
          },
        ],
      },
      {
        title: t('boot_hash_group_status', 'Status'),
        items: [
          {
            type: 'custom',
            id: 'bh-active-status-card',
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item bh-card bh-card--compact ${posClass || 'list-item--first'}">
                  <div class="bh-row">
                    <div class="li-icon"><md-icon aria-hidden="true">verified_user</md-icon></div>
                    <div class="list-item-content">
                      <div class="toggle-text">${t('boot_hash_active_label', 'Active (ro.boot.vbmeta.digest)')}</div>
                      <span class="supporting-text bh-mono bh-mono--block bh-mono--primary" id="bh-active-val">
                        ${escapeHtml(activeHash || t('boot_hash_active_empty', 'None'))}
                      </span>
                    </div>
                  </div>
                </div>
              `;
              activeHashEl = container.querySelector('#bh-active-val');
            },
          },
          {
            type: 'custom',
            id: 'bh-cache-status-card',
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item bh-card ${posClass || 'list-item--last'}">
                  <div class="bh-row">
                    <div class="li-icon"><md-icon aria-hidden="true">storage</md-icon></div>
                    <div class="list-item-content bh-content-flex">
                      <div class="toggle-text">${t('boot_hash_cache_title', 'Cached Hash')}</div>
                      <span class="supporting-text bh-mono bh-mono--block" id="bh-cache-val">
                        ${escapeHtml(cachedHash || t('boot_hash_cache_empty', 'None'))}
                      </span>
                    </div>
                  </div>
                  <div class="bh-actions-row">
                    <md-text-button id="bh-refresh-cache-btn" class="bh-pill-button">
                      <md-icon slot="icon" aria-hidden="true">refresh</md-icon>
                      ${t('boot_hash_refresh_btn', 'Refresh')}
                    </md-text-button>
                    <md-filled-tonal-button id="bh-clear-cache-btn" class="bh-pill-button" ${!cachedHash ? 'disabled' : ''}>
                      <md-icon slot="icon" aria-hidden="true">delete_sweep</md-icon>
                      ${t('boot_hash_clear_cache', 'Clear Cache')}
                    </md-filled-tonal-button>
                  </div>
                </div>
              `;
              cacheHashEl = container.querySelector('#bh-cache-val');
              clearCacheBtn = container.querySelector('#bh-clear-cache-btn');
              const refreshBtn = container.querySelector('#bh-refresh-cache-btn');

              clearCacheBtn?.addEventListener('click', async () => {
                if (moddir) {
                  await exec(`sh ${shellEscape(moddir + '/features/boot_hash.sh')} --clear-cache 2>/dev/null || rm -f /data/adb/specter/boot_hash 2>/dev/null || true`);
                }
                if (cacheHashEl) {
                  cacheHashEl.textContent = t('boot_hash_cache_empty', 'None');
                }
                clearCacheBtn?.setAttribute('disabled', '');
                showToast(t('boot_hash_cache_cleared', 'Cache cleared'), {
                  icon: 'check_circle',
                  type: 'success',
                  autoCloseDelay: 2500,
                });
              });

              refreshBtn?.addEventListener('click', async () => {
                if (refreshBtn) refreshBtn.setAttribute('disabled', '');
                try {
                  if (moddir) {
                    await exec(`sh ${shellEscape(moddir + '/features/boot_hash.sh')} --refresh 2>/dev/null || true`);
                    try {
                      const { stdout: actOut } = await exec('resetprop ro.boot.vbmeta.digest 2>/dev/null || true');
                      if (activeHashEl) activeHashEl.textContent = actOut.trim() || t('boot_hash_active_empty', 'None');
                    } catch {}
                    try {
                      const { stdout: cOut } = await exec('cat /data/adb/specter/boot_hash 2>/dev/null || true');
                      const cVal = cOut.trim();
                      if (cacheHashEl) {
                        cacheHashEl.textContent = cVal || t('boot_hash_cache_empty', 'None');
                      }
                      if (cVal) clearCacheBtn?.removeAttribute('disabled');
                    } catch {}
                  }
                  showToast(t('boot_hash_refreshed', 'Refreshed'), {
                    icon: 'check_circle',
                    type: 'success',
                    autoCloseDelay: 2500,
                  });
                } finally {
                  if (refreshBtn) refreshBtn.removeAttribute('disabled');
                }
              });
            },
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('boot_hash_info_title', 'Boot Hash'),
      text: t(
        'boot_hash_info_desc',
        'Fixes ro.boot.vbmeta.digest by syncing with hardware TEE attestation, or applies custom hash when set.'
      ),
    },
    fab: (container, instance) => {
      container.innerHTML = `
        <md-fab variant="primary" class="subpage-fab" id="bh-save-fab" label="${t('dialog_save', 'Save')}">
          <md-icon slot="icon" aria-hidden="true">save</md-icon>
        </md-fab>
      `;

      const saveFab = container.querySelector('#bh-save-fab') as HTMLElement | null;
      saveFab?.addEventListener('click', async () => {
        const val = hashInputEl?.value.trim().toLowerCase() || '';
        if (val && !/^[0-9a-f]{64}$/.test(val)) {
          showToast(t('boot_hash_invalid', 'Must be 64 hex characters'), {
            icon: 'error',
            type: 'error',
            autoCloseDelay: 3000,
          });
          return;
        }

        saveFab.setAttribute('disabled', '');
        try {
          cfgSet('custom_boot_hash', val);
          if (moddir) {
            if (val) {
              await exec(`su -c "resetprop -n ro.boot.vbmeta.digest ${shellEscape(val)}" 2>/dev/null || resetprop -n ro.boot.vbmeta.digest ${shellEscape(val)} 2>/dev/null || true`);
            } else {
              await exec(`sh ${shellEscape(moddir + '/features/boot_hash.sh')} --refresh 2>/dev/null || true`);
            }
            try {
              const { stdout } = await exec('resetprop ro.boot.vbmeta.digest 2>/dev/null || true');
              if (activeHashEl) activeHashEl.textContent = stdout.trim() || t('boot_hash_active_empty', 'None');
            } catch {}
            try {
              const { stdout: cOut } = await exec('cat /data/adb/specter/boot_hash 2>/dev/null || true');
              const cVal = cOut.trim();
              if (cacheHashEl) {
                cacheHashEl.textContent = cVal || t('boot_hash_cache_empty', 'None');
              }
              if (clearCacheBtn) {
                if (cVal) clearCacheBtn.removeAttribute('disabled');
                else clearCacheBtn.setAttribute('disabled', '');
              }
            } catch {}
          }
          showToast(t('boot_hash_saved', 'Saved'), {
            icon: 'check_circle',
            type: 'success',
            autoCloseDelay: 2500,
          });
          instance.close();
        } catch {
          showToast(t('simple_toast_error', 'Failed'), {
            icon: 'error',
            type: 'error',
            autoCloseDelay: 3000,
          });
        } finally {
          saveFab.removeAttribute('disabled');
        }
      });
    },
  });
}
