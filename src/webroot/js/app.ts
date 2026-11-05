import { initBridge, getDataDir, getModuleDir, exec } from './bridge.js';
import { shellEscape, setDevMode, updateListContainerCorners, initCornerObserver, afterPaint, wireLazyClick } from './utils.js';
import { setDataDir, migrateLocalStorage, cfgInit, cfgGet } from './cfg.js';
import { initDevice, refreshDevice, refreshKeyboxStatus, refreshConflictStatus, reapplyKeyboxStatus } from './device.js';
import { initNetwork, refreshNetworkStatus } from './network.js';
import { initTheme } from './theme.js';
import { initI18n, t } from './i18n.js';
import { loadContributors } from './contributors.js';
import { initRedirect } from './redirect.js';
import { showToast } from './toast.js';
import { initTerminal } from './terminal.js';
import { renderActivityPreview } from './history.js';
import { wireTopBarScroll, wireNavigation, onHomeShow, onPageActivate } from './navigation.js';
import { initFonts } from './font.js';
import { FEATURE_I18N_KEYS } from './constants.js';
import { wireActions, buildFriendlyNames } from './actions.js';
import { wireControlRows } from './control-ui.js';
import { updatePlayIntegritySectionVisibility } from './pif-section.js';
import { updateModuleConfigSectionVisibility } from './module-config-section.js';


let _homeInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) await import('./dev-mock.js');

  import('./material-core.js').catch(e => console.warn('Material components failed:', e));

  try {
    await initBridge();
    const dataPath = getDataDir();
    if (dataPath) setDataDir(dataPath);
  } catch (e) { console.warn('Bridge init failed:', e); }

  wireTopBarScroll();
  wireNavigation();
  initRedirect();
  wireActions();
  buildFriendlyNames();
  updateListContainerCorners();

  const cfgReady = (async () => {
    try {
      await cfgInit();
      await migrateLocalStorage();
    } catch (e) { console.warn('Config init failed:', e); }
  })();

  void cfgReady.then(() => {
    void initFonts().catch(() => {});
    cfgGet('theme', 'dark').then(mode => initTheme(mode || 'dark')).catch(() => {});
    cfgGet('dev_mode', 'false').then(v => setDevMode(v === 'true')).catch(() => {});
  });

  document.addEventListener('languageChanged', () => {
    loadContributors().catch(() => {});
    renderActivityPreview();
    refreshNetworkStatus();
    refreshKeyboxStatus().catch(() => {});
    void import('./pif-choose-desc.js').then(m => m.refreshPifChooseDesc()).catch(() => {});
    import('./dark-theme-ui.js').then(m => m.updateDarkThemeSummary()).catch(() => {});
    import('./language-ui.js').then(m => m.updateLanguageSummary()).catch(() => {});
    import('./colors-ui.js').then(m => m.updateColorsSummary()).catch(() => {});
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    const indicator = document.getElementById('nav-indicator') as HTMLElement | null;
    if (active && indicator) {
      indicator.style.left = active.offsetLeft + 'px';
      indicator.style.width = active.offsetWidth + 'px';
    }
  });

  onPageActivate('tools-page', () => cfgReady.then(loadToolsUI));
  onPageActivate('control-page', () => cfgReady.then(loadControlUI));
  onPageActivate('settings-page', () => cfgReady.then(loadSettingsUI));

  renderActivityPreview();
  initDevice().catch(() => {});
  void cfgReady
    .then(() => initI18n())
    .then(() => reapplyKeyboxStatus())
    .catch(() => {});
  onHomeShow(() => {
    renderActivityPreview();
    if (!_homeInitialized) { _homeInitialized = true; return; }
    refreshDevice(true).catch(() => {});
    refreshKeyboxStatus().catch(() => {});
  });

  afterPaint(() => {
    initNetwork();
    initCornerObserver();
  });

  const updateDialogOpen = () => {
    document.body.classList.toggle('dialog-open', !!document.querySelector('md-dialog[open]'));
  };
  const trackDialog = (dialog: Element) => {
    if (dialog.hasAttribute('data-sp-tracked')) return;
    dialog.setAttribute('data-sp-tracked', '');
    // `open` fires before the attribute is set; `closed` fires after removal.
    dialog.addEventListener('open', () => document.body.classList.add('dialog-open'));
    dialog.addEventListener('opened', updateDialogOpen);
    dialog.addEventListener('closed', updateDialogOpen);
  };
  document.querySelectorAll('md-dialog').forEach(trackDialog);
  let dialogScanRaf: number | null = null;
  const dialogObserver = new MutationObserver(() => {
    // One scan per frame instead of one per added node.
    if (dialogScanRaf !== null) return;
    dialogScanRaf = requestAnimationFrame(() => {
      dialogScanRaf = null;
      document.querySelectorAll('md-dialog').forEach(trackDialog);
      updateDialogOpen();
    });
  });
  dialogObserver.observe(document.body, { childList: true, subtree: true });
  document.getElementById('progress-dialog')?.addEventListener('cancel', (e: Event) => e.preventDefault());
});

async function loadToolsUI() {
  const sectionVisibility = Promise.all([
    updatePlayIntegritySectionVisibility().catch(() => false),
    updateModuleConfigSectionVisibility().catch(() => false),
  ]);
  const [keybox, autoTarget, autoHma, autopif, autokeybox, romFp, adb, prop, gms, hma, actionSecurityPatch, securityPatch, omk] = await Promise.all([
    import('./keybox-ui.js').catch(() => null),
    import('./auto-target-ui.js').catch(() => null),
    import('./auto-hma-ui.js').catch(() => null),
    import('./autopif-ui.js').catch(() => null),
    import('./autokeybox-ui.js').catch(() => null),
    import('./rom-fingerprint-ui.js').catch(() => null),
    import('./adb-disabler-ui.js').catch(() => null),
    import('./prop-handler-ui.js').catch(() => null),
    import('./gms-ui.js').catch(() => null),
    import('./hma-ui.js').catch(() => null),
    import('./action-security-patch-ui.js').catch(() => null),
    import('./security-patch-ui.js').catch(() => null),
    import('./omk-trust-ui.js').catch(() => null),
  ]);

  keybox?.wireKeybox();
  autoTarget?.wireAutoTarget();
  autoHma?.wireAutoHma();
  autopif?.wireAutopif();
  autokeybox?.wireAutokeybox();
  romFp?.wireRomFingerprint();
  adb?.wireAdbDisabler();
  prop?.wirePropHandler();
  gms?.wireGms();
  hma?.wireHma();
  actionSecurityPatch?.wireActionSecurityPatch();
  securityPatch?.wireSecurityPatch();
  omk?.wireOmkTrust();
  omk?.wireOmkRestart();

  wireLazyClick('target-apps-btn', () => import('./target-apps.js').then(m => m.openTargetAppsManager()));
  const pifRow = document.getElementById('pif-choose-device');
  if (pifRow) pifRow.hidden = false;
  wireLazyClick('pif-choose-device', () => import('./pif-device-ui.js').then(m => m.openPifDeviceSubpage()));
  wireLazyClick('boot-hash-btn', () => import('./boot-hash-ui.js').then(m => m.openBootHashSubpage()));
  import('./pif-choose-desc.js').then(m => m.refreshPifChooseDesc()).catch(() => {});

  ensureConflicts().catch(() => {});
  await sectionVisibility;
  updateListContainerCorners();
}

async function loadControlUI() {
  const toggles = await import('./toggles.js').catch(() => null);
  if (!toggles) return;
  toggles.renderControlToggles();
  await wireControlRows();
  // Control rows may have appeared after the conflict script ran on Tools.
  applyConflictOwnership();
  ensureConflicts().then(() => applyConflictOwnership()).catch(() => {});
  updateListContainerCorners();
}

async function loadSettingsUI() {
  const [font, dark, language, colors, toggles] = await Promise.all([
    import('./font.js').catch(() => null),
    import('./dark-theme-ui.js').catch(() => null),
    import('./language-ui.js').catch(() => null),
    import('./colors-ui.js').catch(() => null),
    import('./toggles.js').catch(() => null),
  ]);

  font?.wireFontToggles();
  dark?.wireDarkTheme();
  dark?.updateDarkThemeSummary();
  language?.wireLanguageUI();
  language?.updateLanguageSummary();
  colors?.wireColorsUI();
  colors?.updateColorsSummary();
  toggles?.wireDevMode();
  initTerminal();
  loadContributors().catch(() => {});
}

let _conflictsPromise: Promise<void> | null = null;
let _applyConflictOwnership: (() => void) | null = null;

function ensureConflicts(): Promise<void> {
  if (!_conflictsPromise) _conflictsPromise = wireConflictToggles();
  return _conflictsPromise;
}

function applyConflictOwnership() {
  _applyConflictOwnership?.();
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

  // Module-owned features get their Specter controls hidden (see applyOwnership).
  const entries = data.map(m => ({ key: m.key, prioritySpecter: m.prioritySpecter }));
  const applyOwnership = () => {
    const te = entries.find(e => e.key === 'teesim');
    const moduleOwns = te ? !te.prioritySpecter : false;
    document.getElementById('security-patch-btn')?.toggleAttribute('hidden', moduleOwns);
    document.getElementById('toggle-action_security_patch')?.toggleAttribute('hidden', moduleOwns);
  };

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
        if (typeof result.code === 'number' && result.code !== 0) throw new Error(result.stderr || 'Failed to update');

        const entry = entries.find(e => e.key === mod.key);
        if (entry) entry.prioritySpecter = !isModule;
        applyOwnership();

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
      } finally { sw.disabled = false; }
    });
  }

  _applyConflictOwnership = applyOwnership;
  applyOwnership();
  updateListContainerCorners();
}
