import { initBridge, getDataDir, getModuleDir, exec } from './bridge.js';
import { shellEscape } from './utils.js';
import { setDataDir, migrateLocalStorage, cfgInit, cfgGet } from './cfg.js';
import { initDevice, refreshDevice, refreshKeyboxStatus, refreshConflictStatus } from './device.js';
import { initNetwork } from './network.js';
import { initTheme } from './theme.js';
import { initI18n, getTranslation } from './i18n.js';
import { loadContributors } from './contributors.js';
import { initRedirect } from './redirect.js';
import { showToast } from './toast.js';
import { initTerminal } from './terminal.js';
import { setDevMode } from './state.js';
import { renderActivityPreview } from './history.js';
import { wireTopBarScroll, wireNavigation, onHomeShow } from './navigation.js';
import { renderControlToggles, wireDevMode } from './toggles.js';
import { FEATURE_I18N_KEYS } from './constants.js';
import { wireActions, buildFriendlyNames } from './actions.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

/*
 * Init phases (in order):
 *   0 — Critical path (bridge + config + core MWC), must complete
 *   1 — Render frame (theme, navigation, redirect)
 *   2 — Wire event handlers (all addEventListener, zero I/O)
 *   2b — Page-specific wiring (lazy imports)
 *   3 — Load text + data (fire-and-forget async)
 *   4 — Preload page MWC + background tasks
 *   5 — Lazy per-tab data (fire-and-forget async)
 */
let _homeInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
  /* Phase 0: Critical path — start MWC load in parallel with bridge/cfg */
  const coreMWC = import('./material-core.js');
  try {
    await initBridge();
    const dataPath = getDataDir();
    if (dataPath) setDataDir(dataPath);
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
  renderControlToggles();
  wireDevMode();
  buildFriendlyNames();
  initTerminal();

  /* Phase 2b: Page-specific wiring (lazy imports) */
  import('./keybox-ui.js').then(m => {
    m.wireCustomKeybox();
    m.wireKeyboxInstallButton();
  }).catch(() => {});
  import('./target-apps.js').then(m => m.wireTargetApps()).catch(() => {});
  import('./auto-target-ui.js').then(m => m.wireAutoTarget()).catch(() => {});
  import('./autopif-ui.js').then(m => m.wireAutopif()).catch(() => {});
  import('./autokeybox-ui.js').then(m => m.wireAutokeybox()).catch(() => {});
  import('./rom-fingerprint-ui.js').then(m => m.wireRomFingerprint()).catch(() => {});
  import('./adb-disabler-ui.js').then(m => {
    m.wireAdbDisabler();
  }).catch(() => {});
  import('./boot-harden-ui.js').then(m => m.wireBootHarden()).catch(() => {});
  import('./prop-handler-ui.js').then(m => m.wirePropHandler()).catch(() => {});
  import('./gms-ui.js').then(m => m.wireGms()).catch(() => {});
  import('./security-patch-ui.js').then(m => m.wireSecurityPatch()).catch(() => {});
  import('./boot-hash-ui.js').then(m => m.wireBootHash()).catch(() => {});
  import('./tee-bhash-ui.js').then(m => m.wireTeeHash()).catch(() => {});
  import('./font.js').then(m => m.wireFontToggles()).catch(() => {});

  const savedDevMode = await cfgGet('dev_mode', 'false') || 'false';
  setDevMode(savedDevMode === 'true');
  const sw = document.getElementById('dev-mode-switch') as MdSwitch | null;
  if (sw) sw.selected = savedDevMode === 'true';

  document.addEventListener('languageChanged', () => {
    loadContributors().catch(() => {});
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    const indicator = document.getElementById('nav-indicator') as HTMLElement | null;
    if (active && indicator) {
      indicator.style.left = active.offsetLeft + 'px';
      indicator.style.width = active.offsetWidth + 'px';
    }
  });

  /* Phase 3: Load text + data */
  initI18n().then(() => loadContributors()).catch(() => {});
  initDevice().catch(() => {});
  renderActivityPreview();
  onHomeShow(() => {
    renderActivityPreview();
    if (!_homeInitialized) { _homeInitialized = true; return; }
    refreshDevice().catch(() => {});
    refreshKeyboxStatus().catch(() => {});
  });

  /* Phase 4: Background tasks */
  initNetwork();
  import('./keybox-ui.js').then(m => m.populateProviders()).catch(() => {});
  import('./font.js').then(m => m.initFonts()).catch(() => {});

  /* Phase 5: Lazy per-tab data */
  wireConflictToggles().catch(() => {});
});

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
    const prettyFeatures = mod.features
      ? [...new Set(mod.features.split(',').map(f => f.trim()).map(f => {
          const key = FEATURE_I18N_KEYS[f];
          return key ? t(key, f) : f;
        }))].join(', ')
      : '';
    const featLabel = prettyFeatures ? `${t('conflict_covers', 'Covers')}: ${prettyFeatures} | ` : '';
    hint.textContent = featLabel.replace(/ \| $/, '');

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
        const code = result.code;
        if (typeof code === 'number' && code !== 0) {
          const err = result.stderr || 'Failed to update';          throw new Error(String(err));
        }

        const prettyFeatures = mod.features
          ? [...new Set(mod.features.split(',').map(f => f.trim()).map(f => {
              const key = FEATURE_I18N_KEYS[f];
              return key ? t(key, f) : f;
            }))].join(', ')
          : '';
        const featLabel = prettyFeatures ? `${t('conflict_covers', 'Covers')}: ${prettyFeatures} | ` : '';
        hint.textContent = featLabel.replace(/ \| $/, '');
        showToast(`${mod.friendlyName}: ${isModule ? t('conflict_toast_module_handles', 'Module handles it') : t('conflict_toast_specter_handles', 'Specter handles it')}`, { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      } catch (e) {
        showToast(t('toast_failed_update', 'Failed to update'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        sw.selected = !sw.selected;
      } finally {
        sw.disabled = false;
      }
    });
  }
}
