// Dialogs used by the App Targeting overlay. openModeDialog /
// openRegenerateDialog take a context with the overlay state they mutate;
// openTeesimModeDialog only shells out to teesim_mode.sh.
import { exec, getModuleDir, spawnCommand } from './bridge.js';
import { cfgSet } from './cfg.js';
import { escapeHtml, shellEscape } from './utils.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { t } from './i18n.js';
import { showDialog } from './dialog.js';
import { openSubPage, type SubPageInstance } from './subpage.js';
import { openAppRegenerateDialog } from './app-list-dialogs.js';
import type { AppListEntry } from './app-list-model.js';

/** Resolve after two frames, once the disabled button and toast have painted. */
function afterNextPaint(): Promise<void> {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame !== 'function') {
            resolve();
            return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}


export interface TargetDialogsContext {
  apps: AppListEntry[];
  getDefaultMode(): string;
  setDefaultMode(m: string): void;
  applyFilters(): void;
  refreshApps(): Promise<void>;
  loading: HTMLElement;
  list: HTMLElement;
}

export function openTeesimModeDialog() {
    const moddir = getModuleDir();
    if (!moddir) return;
    const scriptPath = shellEscape(moddir + '/features/teesim_mode.sh');
    const d = showDialog(
      escapeHtml(t('ta_teesim_mode_title', 'Operation Mode')),
      `<div class="ta-mode-content">
        <p class="supporting-text ta-mode-desc">${escapeHtml(t('ta_teesim_mode_desc', 'Applies to all apps in the TEESimulator default profile'))}</p>
        <md-outlined-segmented-button-set id="ta-teesim-mode-set">
          <md-outlined-segmented-button value="patch" selected label="${escapeHtml(t('ta_teesim_mode_patch', 'Patch'))}"></md-outlined-segmented-button>
          <md-outlined-segmented-button value="generation" label="${escapeHtml(t('ta_teesim_mode_generation', 'Generation'))}"></md-outlined-segmented-button>
        </md-outlined-segmented-button-set>
      </div>`,
      `<md-text-button class="dialog-action-close">${escapeHtml(t('dialog_cancel', 'Cancel'))}</md-text-button>
       <md-filled-button id="ta-teesim-mode-apply">${escapeHtml(t('dialog_apply', 'Apply'))}</md-filled-button>`
    );

    let _touched = false;
    exec(`sh ${scriptPath} --get 2>/dev/null || echo patch`).then(({ stdout }) => {
      if (_touched) return;
      const cur = stdout.trim();
      if (cur === 'patch' || cur === 'generation') {
        d.querySelectorAll('#ta-teesim-mode-set md-outlined-segmented-button').forEach(b => {
          (b as HTMLElement & { selected: boolean }).selected = b.getAttribute('value') === cur;
        });
      }
    }).catch(() => {});

    d.querySelectorAll('#ta-teesim-mode-set md-outlined-segmented-button').forEach(b => {
      b.addEventListener('click', () => { _touched = true; });
    });
    const applyBtn = d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean };
    applyBtn.addEventListener('click', async () => {
      if (applyBtn.disabled) return;
      let mode = 'patch';
      d.querySelectorAll('#ta-teesim-mode-set md-outlined-segmented-button').forEach(b => {
        if ((b as HTMLElement & { selected: boolean }).selected) mode = b.getAttribute('value') || 'patch';
      });
      applyBtn.disabled = true;
      const loadingToast = showLoadingToast(t('common_loading', 'Loading...'));
      await afterNextPaint();
      try {
        const { code, stderr } = await spawnCommand(`sh ${scriptPath} --set ${shellEscape(mode)}`);
        if (code !== 0) {
          updateToast(loadingToast, stderr.trim() || t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
          return;
        }
        updateToast(loadingToast, t('ta_teesim_mode_saved', 'Operation mode saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        d.close();
      } catch {
        updateToast(loadingToast, t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      } finally {
        applyBtn.disabled = false;
      }
    });
    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
    paintSeg(d);
  }

function paintSeg(root: HTMLElement): void {
    const rootStyle = document.documentElement.style;
    const colors: Record<string, [string, string]> = {
      bare: [rootStyle.getPropertyValue('--md-sys-color-primary').trim(), rootStyle.getPropertyValue('--md-sys-color-on-primary').trim()],
      conditional: [rootStyle.getPropertyValue('--md-sys-color-tertiary').trim(), rootStyle.getPropertyValue('--md-sys-color-on-tertiary').trim()],
      force: [rootStyle.getPropertyValue('--md-sys-color-error').trim(), rootStyle.getPropertyValue('--md-sys-color-on-error').trim()],
      patch: [rootStyle.getPropertyValue('--md-sys-color-primary').trim(), rootStyle.getPropertyValue('--md-sys-color-on-primary').trim()],
      generation: [rootStyle.getPropertyValue('--md-sys-color-error').trim(), rootStyle.getPropertyValue('--md-sys-color-on-error').trim()],
    };
    root.querySelectorAll<HTMLElement>('md-outlined-segmented-button').forEach(btn => {
      const val = btn.getAttribute('value');
      if (!val) return;
      const pair = colors[val];
      if (!pair || !pair[0] || !pair[1]) return;
      const [bg, fg] = pair;
      btn.classList.add('segmented-flex');
      btn.style.setProperty('--md-outlined-segmented-button-selected-container-color', bg);
      btn.style.setProperty('--md-outlined-segmented-button-selected-label-text-color', fg);
      btn.style.setProperty('--md-outlined-segmented-button-selected-icon-color', fg);
    });
  }

export function openModeSubpage(ctx: TargetDialogsContext): Promise<SubPageInstance> {
  const currentMode = ctx.getDefaultMode();

  return openSubPage({
    id: 'target-default-mode',
    title: t('ta_mode_settings', 'Default Mode'),
    description: t('ta_mode_desc', 'Controls the default mode suffix added to new app targets in Tricky Store'),
    onClose: () => {
      window.isOverlayOpen = true;
      document.documentElement.style.overflow = 'hidden';
    },
    groups: [
      {
        title: t('ta_mode_settings', 'Default Mode'),
        items: [
          {
            type: 'radio',
            id: 'ta-mode-radio-bare',
            name: 'target_default_mode',
            value: 'bare',
            title: t('ta_mode_bare', 'Auto'),
            description: t('ta_mode_bare_desc', 'Auto-detect based on device TEE support'),
            selected: currentMode === 'bare',
            onSelect: () => {
              ctx.setDefaultMode('bare');
              cfgSet('target_default_mode', 'bare');
              showToast(t('ta_default_saved', 'Default mode saved'), {
                icon: 'check_circle',
                type: 'success',
                autoCloseDelay: 2500,
              });
            },
          },
          {
            type: 'radio',
            id: 'ta-mode-radio-conditional',
            name: 'target_default_mode',
            value: 'conditional',
            title: t('ta_mode_conditional', 'Leaf'),
            description: t('ta_mode_conditional_desc', 'Patch leaf certificate from hardware TEE'),
            badge: '?',
            selected: currentMode === 'conditional',
            onSelect: () => {
              ctx.setDefaultMode('conditional');
              cfgSet('target_default_mode', 'conditional');
              showToast(t('ta_default_saved', 'Default mode saved'), {
                icon: 'check_circle',
                type: 'success',
                autoCloseDelay: 2500,
              });
            },
          },
          {
            type: 'radio',
            id: 'ta-mode-radio-force',
            name: 'target_default_mode',
            value: 'force',
            title: t('ta_mode_force', 'Gen'),
            description: t('ta_mode_force_desc', 'Generate certificate chain from keybox'),
            badge: '!',
            selected: currentMode === 'force',
            onSelect: () => {
              ctx.setDefaultMode('force');
              cfgSet('target_default_mode', 'force');
              showToast(t('ta_default_saved', 'Default mode saved'), {
                icon: 'check_circle',
                type: 'success',
                autoCloseDelay: 2500,
              });
            },
          },
        ],
      },
      {
        items: [
          {
            type: 'custom',
            id: 'ta-mode-override',
            render: (container) => {
              const row = document.createElement('sp-settings-row');
              row.id = 'ta-mode-override-row';
              row.setAttribute('variant', 'action');
              row.setAttribute('headline', t('ta_mode_override_label', 'Override existing'));
              row.setAttribute('supporting-text', t('ta_mode_override_desc', 'Apply this mode to all currently selected apps'));
              const icon = document.createElement('md-icon');
              icon.setAttribute('slot', 'icon');
              icon.setAttribute('aria-hidden', 'true');
              icon.textContent = 'compare_arrows';
              row.append(icon);

              const handleOverride = () => {
                const mode = ctx.getDefaultMode();
                let count = 0;
                for (const app of ctx.apps) {
                  if (app.state !== 'unchecked') {
                    app.state = mode;
                    count++;
                  }
                }
                if (count > 0) {
                  ctx.applyFilters();
                  showToast(
                    t('ta_mode_applied_both', 'Default saved, {count} apps overridden').replace('{count}', String(count)),
                    { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 },
                  );
                } else {
                  showToast(t('ta_default_saved', 'Default mode saved'), {
                    icon: 'check_circle',
                    type: 'success',
                    autoCloseDelay: 2500,
                  });
                }
              };

              row.addEventListener('sp-activate', handleOverride);
              row.addEventListener('click', () => {
                if (!customElements.get('sp-settings-row')) {
                  handleOverride();
                }
              });

              container.replaceWith(row);
            },
          },
        ],
      },
    ],
  });
}

export const openModeDialog = openModeSubpage;

export function openRegenerateDialog(ctx: TargetDialogsContext) {
  openAppRegenerateDialog({
    confirmId: 'ta-regenerate-confirm',
    title: t('ta_regenerate', 'Regenerate'),
    body: t('ta_regenerate_confirm', 'This will re-scan all installed apps and fully rebuild target.txt. Custom per-app states will be overwritten. A backup will be saved.'),
    confirmLabel: t('ta_regenerate', 'Regenerate'),
    cancelLabel: t('dialog_cancel', 'Cancel'),
    successLabel: t('ta_regenerate_success', 'Target list regenerated'),
    loading: ctx.loading,
    list: ctx.list,
    run: async () => {
      await exec(`sh ${shellEscape(getModuleDir() + '/features/target.sh')}`);
    },
    refresh: ctx.refreshApps,
    logStart: '[TARGET] Regenerating target.txt from all apps...',
    logDone: '[TARGET] Regeneration complete',
    logFailed: '[TARGET] Regeneration failed',
  });
}

