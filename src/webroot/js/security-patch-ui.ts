import { exec, getModuleDir, spawnCommand } from './bridge.js';
import { t } from './i18n.js';
import { showToast, closeToast, showLoadingToast, updateToast } from './toast.js';
import { API_URLS, defaultSecurityPatch } from './constants.js';
import { afterPaint, fetchJson, shellEscape, wireRowActivation } from './utils.js';
import { openSubPage } from './subpage.js';
import type { SpSettingsRow } from './ui/sp-settings-row.js';
import type { KeystoreManagerJson } from './types.js';
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

function isDatePatchValue(val: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isOmkPatchValue(val: string): boolean {
  return val === 'auto' || val === 'latest' || isDatePatchValue(val);
}

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export async function openSecurityPatchPage() {
  const moddir = getModuleDir();
  if (!moddir) {
    showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
    return;
  }

  const scriptPath = shellEscape(moddir + '/features/security_patch.sh');

  // Match the target-apps/keybox pattern: the subpage shell opens with
  // skeleton rows in place of the form, the shell is given a paint, and
  // only then do the keystore-manager fetch and security-patch read run.
  // The real form replaces the skeleton when both have landed.
  let loading = true;
  let isOmk = false;
  const valid = (val: string) => (isOmk ? isOmkPatchValue(val) : isDatePatchValue(val));
  let value = defaultSecurityPatch();

  const labelFor = (omk: boolean) => (omk
    ? t('sp_dialog_label_omk', 'Security Patch')
    : t('sp_dialog_label', 'Security Patch Date'));
  const helperFor = (omk: boolean) => (omk
    ? t('sp_helper_omk', 'auto, latest, or YYYY-MM-DD')
    : t('sp_helper_date', 'Use YYYY-MM-DD.'));
  const placeholder = t('sp_placeholder', 'YYYY-MM-DD');
  let helper = helperFor(false);

  let inputEl: HTMLInputElement | null = null;
  let helpEl: HTMLElement | null = null;
  let inputMount: HTMLElement | null = null;
  let deviceMount: HTMLElement | null = null;
  let fetchMount: HTMLElement | null = null;
  let saveFabEl: HTMLElement | null = null;
  let deviceRow: SpSettingsRow | null = null;
  let fetchRow: SpSettingsRow | null = null;
  let quickButtons: HTMLButtonElement[] = [];
  let busy = false;

  const setInputError = (message: string | null) => {
    if (!inputEl || !helpEl) return;
    inputEl.classList.toggle('subpage-inline-input--invalid', !!message);
    inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
    helpEl.classList.toggle('supporting-text--error', !!message);
    helpEl.textContent = message || helper;
  };

  const renderSkeletonRow = (container: HTMLElement, kind: 'input' | 'action'): HTMLElement => {
    container.closest('sp-settings-section')?.setAttribute('aria-hidden', 'true');

    const row = document.createElement('sp-settings-row');
    row.className = 'sp-skeleton-row';
    row.setAttribute('variant', 'custom');
    if (kind === 'input') row.setAttribute('stacked', '');

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

    if (kind === 'input') {
      const input = document.createElement('sp-skeleton');
      input.setAttribute('slot', 'trailing');
      input.setAttribute('variant', 'rounded');
      input.className = 'sp-skeleton-input';
      row.append(input);
    }

    container.replaceWith(row);
    return row;
  };

  const setBusy = (next: boolean) => {
    busy = next;
    for (const row of [deviceRow, fetchRow]) {
      if (!row) continue;
      row.disabled = next;
      row.loading = next;
      row.setAttribute('aria-busy', next ? 'true' : 'false');
    }
  };

  const syncQuick = (next: string) => {
    for (const btn of quickButtons) {
      const selected = btn.dataset.value === next;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  };

  const applyValue = (next: string) => {
    value = next;
    if (inputEl) inputEl.value = next;
    syncQuick(next);
    setInputError(null);
  };

  const runDevice = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { stdout, code } = await exec(`sh ${scriptPath} --device 2>/dev/null`);
      const date = stdout.trim();
      if (code === 0 && isDatePatchValue(date)) {
        applyValue(date);
        showToast(t('sp_device_loaded', 'Loaded device security patch'), {
          icon: 'check_circle', type: 'success', autoCloseDelay: 2500,
        });
      } else {
        showToast(t('sp_device_unavailable', 'Device security patch unavailable'), {
          icon: 'error', type: 'error', autoCloseDelay: 3000,
        });
      }
    } catch {
      showToast(t('sp_device_unavailable', 'Device security patch unavailable'), {
        icon: 'error', type: 'error', autoCloseDelay: 3000,
      });
    } finally {
      setBusy(false);
    }
  };

  const runFetch = async () => {
    if (busy) return;
    setBusy(true);
    const fetchingToast = showToast(t('sp_fetching', 'Fetching latest security patch...'), {
      icon: 'info', type: 'info', autoCloseDelay: 10000,
    });
    try {
      const { stdout } = await exec(`sh ${scriptPath} --fetch 2>/dev/null || echo ""`);
      closeToast(fetchingToast);
      const next = stdout.trim();
      if (valid(next)) {
        applyValue(next);
        showToast(t('sp_fetched', 'Latest security patch fetched'), {
          icon: 'check_circle', type: 'success', autoCloseDelay: 2500,
        });
      } else {
        showToast(t('simple_toast_error', 'Failed'), {
          icon: 'error', type: 'error', autoCloseDelay: 3000,
        });
      }
    } catch {
      closeToast(fetchingToast);
      showToast(t('simple_toast_error', 'Failed'), {
        icon: 'error', type: 'error', autoCloseDelay: 3000,
      });
    } finally {
      setBusy(false);
    }
  };

  const renderActionRow = (
    container: HTMLElement,
    id: string,
    icon: string,
    title: string,
    description: string,
    onClick: () => void,
  ) => {
    if (loading) {
      const mount = renderSkeletonRow(container, 'action');
      if (id === 'sp-device-row') deviceMount = mount;
      if (id === 'sp-fetch-row') fetchMount = mount;
      return;
    }

    container.closest('sp-settings-section')?.removeAttribute('aria-hidden');
    const row = document.createElement('sp-settings-row');
    row.id = id;
    row.setAttribute('variant', 'action');
    row.setAttribute('headline', title);
    row.setAttribute('supporting-text', description);
    const rowIcon = document.createElement('md-icon');
    rowIcon.setAttribute('slot', 'icon');
    rowIcon.setAttribute('aria-hidden', 'true');
    rowIcon.textContent = icon;
    row.append(rowIcon);
    row.addEventListener('sp-activate', onClick);
    container.replaceWith(row);

    if (id === 'sp-device-row') {
      deviceMount = row;
      deviceRow = row as SpSettingsRow;
    }
    if (id === 'sp-fetch-row') {
      fetchMount = row;
      fetchRow = row as SpSettingsRow;
    }
  };

  const renderDeviceAction = (container: HTMLElement) => {
    renderActionRow(
      container,
      'sp-device-row',
      'smartphone',
      t('sp_use_device', 'Use device date'),
      t('sp_use_device_desc', 'Read the security patch from the current system build.'),
      runDevice,
    );
  };

  const renderFetchAction = (container: HTMLElement) => {
    renderActionRow(
      container,
      'sp-fetch-row',
      'language',
      t('sp_fetch_latest', 'Fetch latest date'),
      t('sp_fetch_latest_desc', 'Get the latest date from the Pixel security bulletin.'),
      runFetch,
    );
  };

  const renderInputField = (container: HTMLElement) => {
    if (loading) {
      inputMount = renderSkeletonRow(container, 'input');
      return;
    }

    container.closest('sp-settings-section')?.removeAttribute('aria-hidden');
    const row = document.createElement('sp-settings-row');
    row.id = 'sp-input-row';
    row.setAttribute('variant', 'custom');
    row.setAttribute('stacked', '');
    row.setAttribute('headline', labelFor(isOmk));

    const icon = document.createElement('md-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'security_update_good';
    row.append(icon);

    const help = document.createElement('span');
    help.id = 'sp-input-help';
    help.className = 'supporting-text';
    help.setAttribute('slot', 'supporting');
    help.setAttribute('aria-live', 'polite');
    help.textContent = helper;
    row.append(help);

    const stack = document.createElement('div');
    stack.className = 'sp-input-stack';
    stack.setAttribute('slot', 'trailing');
    stack.innerHTML = `
      <input
        type="text"
        id="sp-input"
        class="sp-date-input"
        value="${value}"
        placeholder="${placeholder}"
        maxlength="10"
        inputmode="${isOmk ? 'text' : 'numeric'}"
        autocapitalize="none"
        autocomplete="off"
        spellcheck="false"
        aria-label="${labelFor(isOmk)}"
        aria-describedby="sp-input-help"
      />
      ${isOmk ? `
        <div class="sp-quick-row">
          <button type="button" class="sp-quick-chip" data-value="auto" aria-pressed="false">${t('sp_auto', 'Auto')}</button>
          <button type="button" class="sp-quick-chip" data-value="latest" aria-pressed="false">${t('sp_latest', 'Latest')}</button>
        </div>
      ` : ''}
    `;
    row.append(stack);
    container.replaceWith(row);
    inputMount = row;

    inputEl = row.querySelector('#sp-input');
    helpEl = row.querySelector('#sp-input-help');
    quickButtons = [...row.querySelectorAll<HTMLButtonElement>('.sp-quick-chip')];
    syncQuick(value);

    inputEl?.addEventListener('input', () => {
      if (!inputEl) return;
      if (!isOmk) {
        const formatted = formatDateInput(inputEl.value);
        if (formatted !== inputEl.value) inputEl.value = formatted;
      }
      value = inputEl.value;
      syncQuick(value);
      setInputError(null);
    });

    for (const btn of quickButtons) {
      btn.addEventListener('click', () => {
        applyValue(btn.dataset.value || '');
      });
    }
  };

  const instance = await openSubPage({
    id: 'security-patch',
    title: t('sp_dialog_title', 'Set Security Patch'),
    description: t(
      'control_toggle_action_security_patch_desc',
      'Write spoofed security patch date to the active keystore manager'
    ),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'sp-input-field',
            render: (container, _isEnabled) => {
              renderInputField(container);
            },
          },
        ],
      },
      {
        items: [
          {
            type: 'custom',
            id: 'sp-device-action',
            render: (container, _isEnabled) => {
              renderDeviceAction(container);
            },
          },
          {
            type: 'custom',
            id: 'sp-fetch-action',
            render: (container, _isEnabled) => {
              renderFetchAction(container);
            },
          },
        ],
      },
    ],
    fab: (container) => {
      container.innerHTML = `
        <md-fab variant="primary" class="subpage-fab" id="sp-save-fab" label="${t('dialog_save', 'Save')}">
          <md-icon slot="icon" aria-hidden="true">save</md-icon>
        </md-fab>
      `;

      const saveFab = container.querySelector('#sp-save-fab') as HTMLElement | null;
      saveFabEl = saveFab;
      // Enabled once the skeleton is replaced by the loaded form.
      saveFab?.setAttribute('disabled', '');
      saveFab?.addEventListener('click', async () => {
        const next = (inputEl?.value ?? value).trim();
        if (!valid(next)) {
          const message = isOmk
            ? t('sp_invalid_omk', 'Use auto, latest, or YYYY-MM-DD')
            : t('sp_invalid_date', 'Invalid date format (use YYYY-MM-DD)');
          setInputError(message);
          showToast(message, { icon: 'error', type: 'error', autoCloseDelay: 3000 });
          return;
        }

        saveFab.setAttribute('disabled', '');
        const loadingToast = showLoadingToast(t('common_loading', 'Loading...'));
        await afterNextPaint();
        try {
          const { code, stderr } = await spawnCommand(`sh ${scriptPath} --set ${shellEscape(next)}`);
          if (code !== 0) {
            updateToast(loadingToast, stderr.trim() || t('sp_save_error', 'Failed to save'), {
              icon: 'error', type: 'error', autoCloseDelay: 4000,
            });
            return;
          }
          await spawnCommand(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
          updateToast(loadingToast, t('sp_saved', 'Security patch date saved'), {
            icon: 'check_circle', type: 'success', autoCloseDelay: 2500,
          });
        } catch {
          updateToast(loadingToast, t('sp_save_error', 'Failed to save'), {
            icon: 'error', type: 'error', autoCloseDelay: 4000,
          });
        } finally {
          if (!loading) saveFab.removeAttribute('disabled');
        }
      });
    },
  });

  instance.overlay.setAttribute('aria-busy', 'true');
  deviceRow = instance.overlay.querySelector('#sp-device-row') as SpSettingsRow | null;
  fetchRow = instance.overlay.querySelector('#sp-fetch-row') as SpSettingsRow | null;

  const loadInitialState = async () => {
    // Exactly the target-apps order: first let the opened page and its
    // skeleton paint, then start the fetch and shell read. Starting them
    // in the same task as the opening can block that first paint.
    await new Promise<void>(resolve => afterPaint(resolve, 300));

    const [km, current] = await Promise.all([
      fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!, 0).catch(() => null),
      exec(`sh ${scriptPath} --get 2>/dev/null || echo ""`)
        .then(result => result.stdout.trim())
        .catch(() => ''),
    ]);

    isOmk = km?.id === 'omk';
    helper = helperFor(isOmk);
    if (current && valid(current)) value = current;

    loading = false;
    if (inputMount) renderInputField(inputMount);
    if (deviceMount) renderDeviceAction(deviceMount);
    if (fetchMount) renderFetchAction(fetchMount);

    instance.overlay.removeAttribute('aria-busy');
    if (saveFabEl) saveFabEl.removeAttribute('disabled');
    else instance.overlay.querySelector('#sp-save-fab')?.removeAttribute('disabled');
  };

  void loadInitialState();
}

export function wireSecurityPatch() {
  const btn = document.getElementById('security-patch-btn');
  if (!btn) return;
  wireRowActivation(btn, () => { void openSecurityPatchPage(); });
}
