import { exec, getModuleDir } from './bridge.js';
import { t } from './i18n.js';
import { showToast, closeToast } from './toast.js';
import { API_URLS, defaultSecurityPatch } from './constants.js';
import { fetchJson, makeRowInteractive, shellEscape } from './utils.js';
import { openSubPage } from './subpage.js';
import type { KeystoreManagerJson } from './types.js';


function isOmkPatchValue(val: string): boolean {
  return val === 'auto' || val === 'latest' || /^\d{4}-\d{2}-\d{2}$/.test(val);
}

function isDatePatchValue(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val);
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

  let isOmk = false;
  try {
    const km = await fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!, 0);
    isOmk = km?.id === 'omk';
  } catch {
    isOmk = false;
  }

  let current = '';
  try {
    const { stdout } = await exec(`sh ${scriptPath} --get 2>/dev/null || echo ""`);
    current = stdout.trim();
  } catch {
    current = '';
  }

  const valid = (val: string) => (isOmk ? isOmkPatchValue(val) : isDatePatchValue(val));
  const defaultDate = defaultSecurityPatch();
  let value = current && valid(current) ? current : defaultDate;

  const label = isOmk
    ? t('sp_dialog_label_omk', 'Security Patch')
    : t('sp_dialog_label', 'Security Patch Date');
  const placeholder = t('sp_placeholder', 'YYYY-MM-DD');
  const helper = isOmk
    ? t('sp_helper_omk', 'auto, latest, or YYYY-MM-DD')
    : t('sp_helper_date', 'Use YYYY-MM-DD.');

  let inputEl: HTMLInputElement | null = null;
  let helpEl: HTMLElement | null = null;
  let deviceRow: HTMLButtonElement | null = null;
  let fetchRow: HTMLButtonElement | null = null;
  let quickButtons: HTMLButtonElement[] = [];
  let busy = false;

  const setInputError = (message: string | null) => {
    if (!inputEl || !helpEl) return;
    inputEl.classList.toggle('subpage-inline-input--invalid', !!message);
    inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
    helpEl.classList.toggle('supporting-text--error', !!message);
    helpEl.textContent = message || helper;
  };

  const setBusy = (next: boolean) => {
    busy = next;
    for (const row of [deviceRow, fetchRow]) {
      if (!row) continue;
      row.disabled = next;
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
    posClass: string | undefined,
    id: string,
    icon: string,
    title: string,
    description: string,
    onClick: () => void,
  ) => {
    container.innerHTML = `
      <button type="button" class="list-item sp-action-row ${posClass || ''}" id="${id}">
        <div class="li-icon"><md-icon aria-hidden="true">${icon}</md-icon></div>
        <div class="list-item-content">
          <div class="toggle-text">${title}</div>
          <span class="supporting-text">${description}</span>
        </div>
        <md-ripple></md-ripple>
      </button>
    `;
    container.querySelector(`#${id}`)?.addEventListener('click', onClick);
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
            render: (container, _isEnabled, posClass) => {
              container.innerHTML = `
                <div class="list-item list-item--stacked ${posClass || 'list-item--only'}" id="sp-input-row">
                  <div class="sp-field-header">
                    <div class="li-icon"><md-icon aria-hidden="true">security_update_good</md-icon></div>
                    <div class="list-item-content">
                      <div class="toggle-text">${label}</div>
                      <span class="supporting-text" id="sp-input-help" aria-live="polite">${helper}</span>
                    </div>
                  </div>
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
                    aria-label="${label}"
                    aria-describedby="sp-input-help"
                  />
                  ${isOmk ? `
                    <div class="sp-quick-row">
                      <button type="button" class="sp-quick-chip" data-value="auto" aria-pressed="false">${t('sp_auto', 'Auto')}</button>
                      <button type="button" class="sp-quick-chip" data-value="latest" aria-pressed="false">${t('sp_latest', 'Latest')}</button>
                    </div>
                  ` : ''}
                </div>
              `;

              inputEl = container.querySelector('#sp-input');
              helpEl = container.querySelector('#sp-input-help');
              quickButtons = [...container.querySelectorAll<HTMLButtonElement>('.sp-quick-chip')];
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
            },
          },
        ],
      },
      {
        items: [
          {
            type: 'custom',
            id: 'sp-device-action',
            render: (container, _isEnabled, posClass) => {
              renderActionRow(
                container,
                posClass,
                'sp-device-row',
                'smartphone',
                t('sp_use_device', 'Use device date'),
                t('sp_use_device_desc', 'Read the security patch from the current system build.'),
                runDevice,
              );
            },
          },
          {
            type: 'custom',
            id: 'sp-fetch-action',
            render: (container, _isEnabled, posClass) => {
              renderActionRow(
                container,
                posClass,
                'sp-fetch-row',
                'language',
                t('sp_fetch_latest', 'Fetch latest date'),
                t('sp_fetch_latest_desc', 'Get the latest date from the Pixel security bulletin.'),
                runFetch,
              );
            },
          },
        ],
      },
    ],
    fab: (container, page) => {
      container.innerHTML = `
        <md-fab variant="primary" class="subpage-fab" id="sp-save-fab" label="${t('dialog_save', 'Save')}">
          <md-icon slot="icon" aria-hidden="true">save</md-icon>
        </md-fab>
      `;

      const saveFab = container.querySelector('#sp-save-fab') as HTMLElement | null;
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
        try {
          const { code, stderr } = await exec(`sh ${scriptPath} --set ${shellEscape(next)}`);
          if (code !== 0) {
            showToast(t('sp_save_error', stderr.trim() || 'Failed to save'), {
              icon: 'error', type: 'error', autoCloseDelay: 4000,
            });
            return;
          }
          await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
          showToast(t('sp_saved', 'Security patch date saved'), {
            icon: 'check_circle', type: 'success', autoCloseDelay: 2500,
          });
          page.close();
        } catch {
          showToast(t('sp_save_error', 'Failed to save'), {
            icon: 'error', type: 'error', autoCloseDelay: 4000,
          });
        } finally {
          saveFab.removeAttribute('disabled');
        }
      });
    },
  });

  deviceRow = instance.overlay.querySelector('#sp-device-row');
  fetchRow = instance.overlay.querySelector('#sp-fetch-row');
}

export function wireSecurityPatch() {
  const btn = document.getElementById('security-patch-btn');
  if (!btn) return;
  makeRowInteractive(btn);
  const activate = () => { void openSecurityPatchPage(); };
  btn.addEventListener('click', activate);
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate();
  });
}
