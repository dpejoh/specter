import { initBridge, getModuleDir, exec } from './bridge.js';
import { shellEscape } from './utils.js';
import { setModuleDir, migrateLocalStorage, cfgInit, cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { initDevice, refreshDevice, refreshKeyboxStatus, refreshConflictStatus } from './device.js';
import { initNetwork } from './network.js';
import { initTheme } from './theme.js';
import { initI18n, getTranslation } from './i18n.js';
import { loadContributors } from './contributors.js';
import { initRedirect } from './redirect.js';
import { showToast } from './toast.js';
import { initTerminal } from './terminal.js';
import { openTargetAppsManager, refreshAppCatalog } from './target-apps.js';
import { setDevMode } from './state.js';
import { wireTopBarScroll, wireNavigation } from './navigation.js';
import { wireControlToggles, wireDevMode } from './toggles.js';
import { wireActions, buildFriendlyNames } from './actions.js';
import { wireSecurityPatch } from './security-patch-ui.js';
import { wireKeyboxCard, wireKeyboxInstallButton, wireCustomKeybox, populateProviders } from './keybox-ui.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

/*
 * Init phases (in order):
 *   0 — Critical path (bridge + config), must complete
 *   0b — Core MWC registration (material-core)
 *   1 — Render frame (theme, navigation, redirect)
 *   2 — Wire event handlers (all addEventListener, zero I/O)
 *   3 — Load text + data (fire-and-forget async)
 *   4 — Background tasks (fire-and-forget async)
 *   5 — Lazy per-tab data (fire-and-forget async)
 */
document.addEventListener('DOMContentLoaded', async () => {
  /* Phase 0: Critical path — start MWC load in parallel with bridge/cfg */
  const coreMWC = import('./material-core.js');
  try {
    await initBridge();
    const modPath = getModuleDir();
    if (modPath) setModuleDir(modPath);
    await cfgInit();
    await migrateLocalStorage();
  } catch (e) {
    console.warn('Bridge init failed, running without module path:', e);
  }
  await coreMWC;

  /* Phase 1: Render frame */
  wireTopBarScroll();
  const savedTheme = await cfgGet('theme', 'dark') || 'dark';
  initTheme(savedTheme);
  wireNavigation();
  initRedirect();

  /* Phase 2: Wire event handlers */
  wireActions();
  wireKeyboxCard();
  wireRefreshButton();
  wireCustomKeybox();
  wireKeyboxInstallButton();
  wireTargetApps();
  wireSecurityPatch();
  wireControlToggles();
  wireDevMode();
  buildFriendlyNames();
  initTerminal();

  const savedDevMode = await cfgGet('dev_mode', 'false') || 'false';
  setDevMode(savedDevMode === 'true');
  const sw = document.getElementById('dev-mode-switch') as MdSwitch | null;
  if (sw) sw.selected = savedDevMode === 'true';

  document.addEventListener('languageChanged', () => {
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    const indicator = document.getElementById('nav-indicator') as HTMLElement | null;
    if (active && indicator) {
      indicator.style.left = active.offsetLeft + 'px';
      indicator.style.width = active.offsetWidth + 'px';
    }
  });

  /* Phase 3: Load text + data */
  initI18n().catch(() => {});
  initDevice().catch(() => {});

  /* Phase 4: Preload page MWC + background tasks */
  import('./material-tools.js').catch(() => {});
  import('./material-control.js').catch(() => {});
  import('./material-settings.js').catch(() => {});
  initNetwork();
  populateProviders().catch(() => {});
  loadContributors().catch(() => {});

  /* Phase 5: Lazy per-tab data */
  wireConflictToggles().catch(() => {});
});

function wireRefreshButton() {
  const btn = document.getElementById('refresh-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await Promise.all([
      refreshDevice(),
      refreshKeyboxStatus(),
      refreshAppCatalog()
    ]);
    btn.disabled = false;
  });
}

function wireTargetApps() {
  const btn = document.getElementById('target-apps-btn');
  if (!btn) return;
  btn.addEventListener('click', openTargetAppsManager);
}

async function wireConflictToggles() {
  const moddir = getModuleDir();
  if (!moddir) return;

  const data = await refreshConflictStatus();
  if (!data || data.length === 0) return;

  const title = document.getElementById('conflicts-title');
  const desc = document.getElementById('conflicts-desc');
  const container = document.getElementById('conflicts-container');
  if (!title || !desc || !container) return;

  title.style.display = '';
  desc.style.display = '';
  container.innerHTML = '';

  for (const mod of data) {
    const row = document.createElement('div');
    row.className = 'list-item list-item--toggle';

    const icon = document.createElement('div');
    icon.className = 'li-icon';
    icon.innerHTML = '<md-icon aria-hidden="true">warning</md-icon>';

    const content = document.createElement('div');
    content.className = 'list-item-content';

    const label = document.createElement('div');
    label.className = 'toggle-text';
    label.textContent = mod.friendlyName;

    const hint = document.createElement('span');
    hint.className = 'supporting-text';
    hint.id = `conflict-hint-${mod.key}`;
    hint.textContent = mod.prioritySpecter ? t('conflict_priority_specter', 'Priority → Specter') : `${t('conflict_priority_module', 'Priority →')} ${mod.friendlyName}`;

    content.appendChild(label);
    content.appendChild(hint);

    const spacer = document.createElement('div');
    spacer.className = 'spacer';

    const sw = document.createElement('md-switch');
    sw.icons = true;
    sw.id = `conflict-switch-${mod.key}`;
    sw.selected = !mod.prioritySpecter;

    row.appendChild(icon);
    row.appendChild(content);
    row.appendChild(spacer);
    row.appendChild(sw);
    container.appendChild(row);

    sw.addEventListener('change', async () => {
      sw.disabled = true;
      try {
        const isModule = sw.selected;
        const choice = isModule ? 'priority_module' : 'priority_specter';

        const cmd = `sh ${shellEscape(moddir + '/webroot/common/conflicts.sh')} set ${shellEscape(mod.key)} ${shellEscape(choice)}`;
        const result = await exec(cmd);
        const code = (result as any).code;
        if (typeof code === 'number' && code !== 0) {
          const err = (result as any).stderr || 'Failed to update';
          throw new Error(String(err));
        }

        hint.textContent = isModule ? `${t('conflict_priority_module', 'Priority →')} ${mod.friendlyName}` : t('conflict_priority_specter', 'Priority → Specter');
        showToast(`${mod.friendlyName}: ${isModule ? t('conflict_toast_module_handles', 'Module handles it') : t('conflict_toast_specter_handles', 'Specter handles it')}`, { icon: 'check_circle', type: 'success' as any, autoCloseDelay: 2500 });
      } catch (e) {
        showToast(t('toast_failed_update', 'Failed to update'), { icon: 'error', type: 'error' as any, autoCloseDelay: 3000 });
        sw.selected = !sw.selected;
      } finally {
        sw.disabled = false;
      }
    });
  }
}
