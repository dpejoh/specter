// Dialogs used by the App Targeting overlay. openModeDialog /
// openRegenerateDialog take a context with the overlay state they mutate;
// openTeesimModeDialog only shells out to teesim_mode.sh.
import { exec, getModuleDir } from './bridge.js';
import { cfgSet } from './cfg.js';
import { escapeHtml, shellEscape } from './utils.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';
import { appendToOutput } from './terminal.js';
import { showDialog } from './dialog.js';
import type { TargetApp, AppState } from './target-apps.js';


export interface TargetDialogsContext {
  apps: TargetApp[];
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
      try {
        const { code, stderr } = await exec(`sh ${scriptPath} --set ${shellEscape(mode)}`);
        if (code !== 0) {
          showToast(stderr.trim() || t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
          applyBtn.disabled = false;
          return;
        }
        showToast(t('ta_teesim_mode_saved', 'Operation mode saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        d.close();
      } catch {
        showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
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

export function openModeDialog(ctx: TargetDialogsContext) {
    const overrideLabel = escapeHtml(t('ta_mode_override_label', 'Override existing'));
    const overrideDesc = escapeHtml(t('ta_mode_override_desc', 'Apply this mode to all currently selected apps'));
    const overrideRow = `
      <sp-settings-section>
        <sp-settings-row variant="toggle">
          <md-icon slot="icon" aria-hidden="true">compare_arrows</md-icon>
          <span slot="headline">${overrideLabel}</span>
          <span slot="supporting">${overrideDesc}</span>
          <md-switch slot="trailing" icons id="ta-mode-do-override" aria-label="${overrideLabel}"></md-switch>
        </sp-settings-row>
      </sp-settings-section>`;
    const d = showDialog(
      escapeHtml(t('ta_mode_settings', 'Default Mode')),
      `<div class="ta-mode-content">
        <p class="supporting-text ta-mode-desc">${escapeHtml(t('ta_mode_desc', 'Controls the default mode suffix added to new app targets in Tricky Store'))}</p>
        <md-outlined-segmented-button-set>
          <md-outlined-segmented-button value="bare"${ctx.getDefaultMode() === 'bare' ? ' selected' : ''} label="${escapeHtml(t('ta_mode_bare', 'Auto'))}"></md-outlined-segmented-button>
          <md-outlined-segmented-button value="conditional"${ctx.getDefaultMode() === 'conditional' ? ' selected' : ''} label="? ${escapeHtml(t('ta_mode_conditional', 'Leaf'))}"></md-outlined-segmented-button>
          <md-outlined-segmented-button value="force"${ctx.getDefaultMode() === 'force' ? ' selected' : ''} label="! ${escapeHtml(t('ta_mode_force', 'Gen'))}"></md-outlined-segmented-button>
        </md-outlined-segmented-button-set>
        ${overrideRow}
      </div>`,
      `<md-text-button class="dialog-action-close">${escapeHtml(t('dialog_cancel', 'Cancel'))}</md-text-button>
       <md-filled-button id="ta-mode-apply">${escapeHtml(t('dialog_apply', 'Apply'))}</md-filled-button>`
    );

    let _mode = ctx.getDefaultMode();
    d.querySelectorAll('md-outlined-segmented-button').forEach(b => {
      b.addEventListener('click', () => { _mode = b.getAttribute('value') || 'bare'; });
    });
    d.querySelector('#ta-mode-apply')!.addEventListener('click', () => {
      ctx.setDefaultMode(_mode);
      cfgSet('target_default_mode', _mode);
      const doOverride = (d.querySelector('#ta-mode-do-override') as HTMLElement & { selected: boolean })?.selected;
      let count = 0;
      if (doOverride) {
        for (const app of ctx.apps) {
          if (app.state !== 'unchecked') {
            app.state = _mode as AppState;
            count++;
          }
        }
        ctx.applyFilters();
      }
      d.close();
      if (count > 0) {
        showToast(t('ta_mode_applied_both', 'Default saved, {count} apps overridden').replace('{count}', String(count)), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      } else {
        showToast(t('ta_default_saved', 'Default mode saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      }
    });
    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
    paintSeg(d);
  }

export function openRegenerateDialog(ctx: TargetDialogsContext) {
    const d = showDialog(
      escapeHtml(t('ta_regenerate', 'Regenerate')),
      `<p class="supporting-text">${escapeHtml(t('ta_regenerate_confirm', 'This will re-scan all installed apps and fully rebuild target.txt. Custom per-app states will be overwritten. A backup will be saved.'))}</p>`,
      `<md-text-button class="dialog-action-close">${escapeHtml(t('dialog_cancel', 'Cancel'))}</md-text-button>
       <md-filled-button id="ta-regenerate-confirm">${escapeHtml(t('ta_regenerate', 'Regenerate'))}</md-filled-button>`
    );

    d.querySelector('#ta-regenerate-confirm')!.addEventListener('click', async () => {
      d.close();
      ctx.loading.style.display = '';
      ctx.list.style.display = 'none';

      appendToOutput('[TARGET] Regenerating target.txt from all apps...');
      try {
        await exec(`sh ${shellEscape(getModuleDir() + '/features/target.sh')}`);
        appendToOutput('[TARGET] Regeneration complete');
        showToast(t('ta_regenerate_success', 'Target list regenerated'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        await ctx.refreshApps();
      } catch (e) {
        appendToOutput(`[TARGET] Regeneration failed: ${e}`, true);
      } finally {
        ctx.loading.style.display = 'none';
        ctx.list.style.display = '';
      }
    });

    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
  }

