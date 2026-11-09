import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { openSubPage } from './subpage.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { exec, getModuleDir, spawnCommand } from './bridge.js';
import { afterPaint, escapeHtml, shellEscape } from './utils.js';
import './ui/sp-skeleton.js';


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

export async function openBootHashSubpage() {
  const moddir = getModuleDir();
  const savedCustom = (await cfgGet('custom_boot_hash', '')) || '';

  // Same pattern as target apps / security patch: the page opens with
  // skeleton status rows, the shell is given a paint, and only then do the
  // two status reads (a resetprop and a file read) run. The real rows
  // replace the skeletons when both have landed.
  let activeHash = '';
  let cachedHash = '';
  let statusLoaded = false;

  let hashInputEl: HTMLInputElement | null = null;
  let activeHashEl: HTMLElement | null = null;
  let cacheHashEl: HTMLElement | null = null;
  let clearCacheBtn: HTMLElement | null = null;
  let activeMount: HTMLElement | null = null;
  let cacheMount: HTMLElement | null = null;

  const renderSkeletonStatusRow = (container: HTMLElement): HTMLElement => {
    container.closest('sp-settings-section')?.setAttribute('aria-hidden', 'true');

    const row = document.createElement('sp-settings-row');
    row.className = 'sp-skeleton-row';
    row.setAttribute('variant', 'custom');

    const icon = document.createElement('sp-skeleton');
    icon.setAttribute('slot', 'leading');
    icon.setAttribute('variant', 'circular');
    icon.className = 'sp-skeleton-icon';
    row.append(icon);

    const headline = document.createElement('span');
    headline.setAttribute('slot', 'headline');
    const title = document.createElement('sp-skeleton');
    title.setAttribute('variant', 'text');
    title.className = 'sp-skeleton-title';
    headline.append(title);
    row.append(headline);

    const supporting = document.createElement('span');
    supporting.setAttribute('slot', 'supporting');
    const description = document.createElement('sp-skeleton');
    description.setAttribute('variant', 'text');
    description.className = 'sp-skeleton-desc';
    supporting.append(description);
    row.append(supporting);

    container.replaceWith(row);
    return row;
  };

  const renderActiveStatus = (container: HTMLElement) => {
    if (!statusLoaded) {
      activeMount = renderSkeletonStatusRow(container);
      return;
    }

    container.closest('sp-settings-section')?.removeAttribute('aria-hidden');
    const row = document.createElement('sp-settings-row');
    row.setAttribute('variant', 'custom');
    row.setAttribute('headline', t('boot_hash_active_label', 'Active (ro.boot.vbmeta.digest)'));
    const icon = document.createElement('md-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'verified_user';
    row.append(icon);
    const value = document.createElement('span');
    value.id = 'bh-active-val';
    value.className = 'bh-mono bh-mono--block bh-mono--primary';
    value.setAttribute('slot', 'supporting');
    value.textContent = statusLoaded
      ? (activeHash || t('boot_hash_active_empty', 'None'))
      : t('common_loading', 'Loading...');
    row.append(value);
    container.replaceWith(row);
    activeMount = row;
    activeHashEl = value;
  };

  const renderCacheStatus = (container: HTMLElement) => {
    if (!statusLoaded) {
      cacheMount = renderSkeletonStatusRow(container);
      return;
    }

    container.closest('sp-settings-section')?.removeAttribute('aria-hidden');
    const row = document.createElement('sp-settings-row');
    row.setAttribute('variant', 'custom');
    row.setAttribute('stacked', '');
    row.setAttribute('headline', t('boot_hash_cache_title', 'Cached Hash'));
    const icon = document.createElement('md-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'storage';
    row.append(icon);
    const value = document.createElement('span');
    value.id = 'bh-cache-val';
    value.className = 'bh-mono bh-mono--block';
    value.setAttribute('slot', 'supporting');
    value.textContent = statusLoaded
      ? (cachedHash || t('boot_hash_cache_empty', 'None'))
      : t('common_loading', 'Loading...');
    row.append(value);
    const actions = document.createElement('div');
    actions.className = 'bh-actions-row';
    actions.setAttribute('slot', 'trailing');
    actions.innerHTML = `
      <md-text-button id="bh-refresh-cache-btn" class="bh-pill-button">
        <md-icon slot="icon" aria-hidden="true">refresh</md-icon>
        ${t('boot_hash_refresh_btn', 'Refresh')}
      </md-text-button>
      <md-filled-tonal-button id="bh-clear-cache-btn" class="bh-pill-button" ${!cachedHash ? 'disabled' : ''}>
        <md-icon slot="icon" aria-hidden="true">delete_sweep</md-icon>
        ${t('boot_hash_clear_cache', 'Clear Cache')}
      </md-filled-tonal-button>
    `;
    row.append(actions);
    container.replaceWith(row);
    cacheMount = row;
    cacheHashEl = value;
    clearCacheBtn = row.querySelector('#bh-clear-cache-btn');
    const refreshBtn = row.querySelector('#bh-refresh-cache-btn');

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
      } catch {
        showToast(t('simple_toast_error', 'Failed'), {
          icon: 'error',
          type: 'error',
          autoCloseDelay: 3000,
        });
      } finally {
        if (refreshBtn) refreshBtn.removeAttribute('disabled');
      }
    });
  };
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
        try {
          await cfgSet('custom_boot_hash', '');
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
        } catch {
          showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        }
      });
    },
    groups: [
      {
        title: t('boot_hash_group_custom', 'Custom Hash'),
        items: [
          {
            type: 'custom',
            id: 'bh-custom-input-card',
            render: (container, _isEnabled) => {
              const row = document.createElement('sp-settings-row');
              row.setAttribute('variant', 'custom');
              row.setAttribute('stacked', '');
              row.setAttribute('headline', t('boot_hash_custom_title', 'Custom Hash'));
              row.setAttribute('supporting-text', t('boot_hash_custom_desc', 'Spoof custom SHA-256 digest'));
              const icon = document.createElement('md-icon');
              icon.setAttribute('slot', 'icon');
              icon.setAttribute('aria-hidden', 'true');
              icon.textContent = 'tag';
              row.append(icon);
              const wrap = document.createElement('div');
              wrap.className = 'subpage-text-input-wrap';
              wrap.setAttribute('slot', 'trailing');
              wrap.innerHTML = `
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
              `;
              row.append(wrap);
              container.replaceWith(row);

              hashInputEl = row.querySelector('#bh-input');
              const pasteBtn = row.querySelector('#bh-paste-btn');
              const zeroBtn = row.querySelector('#bh-zero-btn');

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
            render: (container, _isEnabled) => { renderActiveStatus(container); },
          },
          {
            type: 'custom',
            id: 'bh-cache-status-card',
            render: (container, _isEnabled) => { renderCacheStatus(container); },
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
    fab: (container) => {
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
        const loadingToast = showLoadingToast(t('common_loading', 'Loading...'));
        await afterNextPaint();
        try {
          await cfgSet('custom_boot_hash', val);
          if (moddir) {
            if (val) {
              await spawnCommand(`su -c "resetprop -n ro.boot.vbmeta.digest ${shellEscape(val)}" 2>/dev/null || resetprop -n ro.boot.vbmeta.digest ${shellEscape(val)} 2>/dev/null || true`);
            } else {
              await spawnCommand(`sh ${shellEscape(moddir + '/features/boot_hash.sh')} --refresh 2>/dev/null || true`);
            }
            try {
              const { stdout } = await spawnCommand('resetprop ro.boot.vbmeta.digest 2>/dev/null || true');
              if (activeHashEl) activeHashEl.textContent = stdout.trim() || t('boot_hash_active_empty', 'None');
            } catch {}
            try {
              const { stdout: cOut } = await spawnCommand('cat /data/adb/specter/boot_hash 2>/dev/null || true');
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
          updateToast(loadingToast, t('boot_hash_saved', 'Saved'), {
            icon: 'check_circle',
            type: 'success',
            autoCloseDelay: 2500,
          });
        } catch {
          updateToast(loadingToast, t('simple_toast_error', 'Failed'), {
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

  const loadStatus = async () => {
    // First let the opened page and its skeletons paint, then start the
    // reads; starting them in the same task as the opening can block that
    // first paint.
    await new Promise<void>(resolve => afterPaint(resolve, 300));

    const [activeOut, cachedOut] = await Promise.all([
      exec('resetprop ro.boot.vbmeta.digest 2>/dev/null || true')
        .then(result => result.stdout.trim())
        .catch(() => ''),
      exec('cat /data/adb/specter/boot_hash 2>/dev/null || true')
        .then(result => result.stdout.trim())
        .catch(() => ''),
    ]);
    activeHash = activeOut;
    cachedHash = cachedOut;
    statusLoaded = true;

    if (activeMount) renderActiveStatus(activeMount);
    if (cacheMount) renderCacheStatus(cacheMount);
  };

  void loadStatus();
}
