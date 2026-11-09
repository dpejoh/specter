import { exec, spawnCommand, getModuleDir, getDataDir } from './bridge.js';
import { shellEscape, escapeHtml, afterPaint } from './utils.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { getTranslation } from './i18n.js';
import { appendToOutput } from './terminal.js';
import { showDialog } from './dialog.js';
import { AppIconManager, ksuGlobal } from './target-apps-icons.js';
import { setupOverlayA11y } from './overlay-a11y.js';
import { closeMenu, wireMenuTrigger } from './menu-utils.js';
import { overlayHeader } from './ui-overlay.js';
import { createFilterDropdown, type FilterDropdownHandle, type FilterOption } from './filter-dropdown.js';
import './ui/sp-settings-row.js';
import './ui/sp-settings-section.js';
import './ui/sp-skeleton.js';

type ScopeState = 'unchecked' | 'targeted';
type BlacklistState = 'unchecked' | 'blacklisted';
export type AppState = ScopeState | BlacklistState;
type Mode = 'scope' | 'blacklist';

export interface HmaApp {
  packageName: string;
  appName: string;
  state: AppState;
}

const SCOPE_ICONS: Record<string, string> = {
  unchecked: '',
  targeted: 'done',
};

const SCOPE_LABEL_KEYS: Record<string, string> = {
  unchecked: 'ha_state_unchecked',
  targeted: 'ha_state_targeted',
};

const BLACKLIST_ICONS: Record<string, string> = {
  unchecked: '',
  blacklisted: 'block',
};

const BLACKLIST_LABEL_KEYS: Record<string, string> = {
  unchecked: 'bl_state_not_blacklisted',
  blacklisted: 'bl_state_blacklisted',
};

const specterDir = () => getDataDir() || '/data/adb/specter';

function hmaScript(): string {
  const moddir = getModuleDir();
  if (!moddir) throw new Error('module dir unavailable');
  return shellEscape(moddir + '/features/hma.sh');
}

async function readScopeList(): Promise<string> {
  const { stdout, code, stderr } = await spawnCommand(`sh ${hmaScript()} --list-raw`);
  if (code !== 0) throw new Error(stderr || 'failed to read HMA scope list');
  return stdout || '';
}

async function writeScopeList(content: string): Promise<void> {
  const staging = `${specterDir()}/.hma_scope_staging`;
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const written = await spawnCommand(
    `mkdir -p ${specterDir()} && printf '%s' ${shellEscape(b64)} | base64 -d > ${shellEscape(staging)}`
  );
  if (written.code !== 0) throw new Error(written.stderr || 'failed to stage HMA scope list');
  const committed = await spawnCommand(`sh ${hmaScript()} --set ${shellEscape(staging)}`);
  if (committed.code !== 0) throw new Error(committed.stderr || 'failed to commit HMA scope list');
  await spawnCommand(`rm -f ${shellEscape(staging)}`);
}

function t(key: string, fallback: string): string {
  return getTranslation(key) || fallback;
}

function stateIcons(state: AppState, mode: Mode): string {
  return mode === 'blacklist' ? BLACKLIST_ICONS[state] || '' : SCOPE_ICONS[state] || '';
}

function stateLabelKey(state: AppState, mode: Mode): string {
  if (mode === 'blacklist') return BLACKLIST_LABEL_KEYS[state] || 'unchecked';
  return SCOPE_LABEL_KEYS[state] || 'unchecked';
}

async function shellExec(cmd: string): Promise<{ stdout: string }> {
  try {
    return await exec(cmd);
  } catch {
    return { stdout: '' };
  }
}

async function fetchUserPackages(): Promise<string[]> {
  const pkgSet = new Set<string>();
  const ksu = ksuGlobal();
  if (typeof ksu?.listUserPackages === 'function') {
    try {
      const list = JSON.parse(ksu.listUserPackages()) as string[];
      for (const p of list) pkgSet.add(p);
    } catch {}
  } else if (typeof ksu?.listPackages === 'function') {
    try {
      const list = JSON.parse(ksu.listPackages('user')) as string[];
      for (const p of list) pkgSet.add(p);
    } catch {}
  }
  if (pkgSet.size > 0) return [...pkgSet];

  const r = await shellExec('cmd package list packages -3 2>/dev/null || pm list packages -3 2>/dev/null');
  for (const raw of r.stdout.split('\n')) {
    const pkg = raw.trim().replace(/^package:/, '');
    if (pkg) pkgSet.add(pkg);
  }
  return [...pkgSet];
}

async function resolvePackageNames(packages: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ksu = ksuGlobal();
  if (typeof ksu?.getPackagesInfo === 'function') {
    try {
      const raw = ksu.getPackagesInfo(JSON.stringify(packages));
      const list = JSON.parse(raw) as Array<{ packageName: string; appLabel?: string }>;
      for (let i = 0; i < packages.length && i < list.length; i++) {
        const label = list[i]?.appLabel;
        map.set(packages[i]!, label && label !== packages[i] ? label : packages[i]!);
      }
      for (let i = list.length; i < packages.length; i++) {
        map.set(packages[i]!, packages[i]!);
      }
      return map;
    } catch {}
  }
  for (const pkg of packages) map.set(pkg, pkg);
  return map;
}

function openHmaRegenerateDialog(refresh: () => Promise<void>, loading: HTMLElement, list: HTMLElement) {
  const d = showDialog(
    escapeHtml(t('ha_regenerate', 'Regenerate')),
    `<p class="supporting-text">${escapeHtml(t('ha_regenerate_confirm', 'This will re-scan all installed apps and rebuild HMA-OSS configuration. Custom selections will be overwritten. A backup will be saved.'))}</p>`,
    `<md-text-button class="dialog-action-close">${escapeHtml(t('dialog_cancel', 'Cancel'))}</md-text-button>
     <md-filled-button id="ha-regenerate-confirm">${escapeHtml(t('ha_regenerate', 'Regenerate'))}</md-filled-button>`
  );

  d.querySelector('#ha-regenerate-confirm')!.addEventListener('click', async () => {
    d.close();
    loading.style.display = '';
    list.style.display = 'none';

    appendToOutput('[HMA] Regenerating HMA-OSS config from all apps...');
    try {
      await exec(`sh ${hmaScript()}`);
      appendToOutput('[HMA] Regeneration complete');
      showToast(t('ha_regenerate_success', 'HMA-OSS configuration regenerated'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      await refresh();
    } catch (e) {
      appendToOutput(`[HMA] Regeneration failed: ${e}`, true);
    } finally {
      loading.style.display = 'none';
      list.style.display = '';
    }
  });

  d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
}

function buildOverlayHTML(): string {
  const skeletonRow = `
        <sp-settings-row variant="custom" class="ta-skeleton-row">
          <sp-skeleton slot="leading" variant="rounded" class="ta-skeleton-icon"></sp-skeleton>
          <span slot="headline"><sp-skeleton variant="text" class="ta-skeleton-title"></sp-skeleton></span>
          <span slot="supporting"><sp-skeleton variant="text" class="ta-skeleton-desc"></sp-skeleton></span>
          <sp-skeleton slot="trailing" variant="circular" class="ta-skeleton-state"></sp-skeleton>
        </sp-settings-row>`;
  return `
    <div class="ta-inner">
      <div class="ptr-indicator" id="ha-ptr-indicator">
        <div class="ptr-progress-wrap">
          <md-icon id="ha-ptr-arrow" class="ptr-arrow">refresh</md-icon>
        </div>
      </div>
      ${overlayHeader({
        className: 'ta-header ha-header',
        back: { id: 'ha-back', className: 'ta-back-btn', label: t('common_back', 'Back') },
        title: t('ha_title', 'HMA-OSS Scope'),
        titleTag: 'h2',
        titleClass: 'ta-title ha-title',
        titleId: 'ha-title',
        actions: `<div class="ta-search-container ha-search-container" hidden>
          <md-outlined-text-field id="ha-search" class="ta-search" placeholder="${t('ta_search_placeholder', 'Search apps')}" aria-label="${escapeHtml(t('ta_search_placeholder', 'Search apps'))}">
            <md-icon-button slot="trailing-icon" id="ha-search-clear" aria-label="${escapeHtml(t('ta_search_clear', 'Clear search'))}" style="display: none;">
              <md-icon aria-hidden="true">close</md-icon>
            </md-icon-button>
          </md-outlined-text-field>
        </div>
        <button id="ha-search-btn" class="ta-menu-btn" aria-label="${escapeHtml(t('ta_search_placeholder', 'Search apps'))}" aria-expanded="false">
          <md-icon aria-hidden="true">search</md-icon>
        </button>
        <button id="ha-menu-btn" class="ta-menu-btn" aria-label="${escapeHtml(t('ta_menu_more', 'More options'))}">
          <md-icon aria-hidden="true">more_vert</md-icon>
        </button>
        <md-menu id="ha-menu" class="ta-menu" anchor="ha-menu-btn" positioning="fixed">
          <md-menu-item id="ha-refresh" class="first">
            <div slot="headline">${escapeHtml(t('ta_refresh', 'Refresh'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-select-all">
            <div slot="headline">${escapeHtml(t('ta_select_all', 'Select All'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-deselect-all">
            <div slot="headline">${escapeHtml(t('ta_deselect_all', 'Deselect All'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-regenerate">
            <div slot="headline">${escapeHtml(t('ha_regenerate', 'Regenerate'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-toggle-system">
            <div slot="headline">${escapeHtml(t('ta_show_system', 'Show system apps'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-toggle-mode">
            <div slot="headline">${escapeHtml(t('ta_edit_blacklist', 'Edit blacklist'))}</div>
          </md-menu-item>
          <md-menu-item id="ha-import-denylist" class="last">
            <div slot="headline">${escapeHtml(t('ta_import_denylist', 'Import from DenyList'))}</div>
          </md-menu-item>
        </md-menu>`,
      })}

      <div class="ta-filters" id="ha-filters"></div>

      <div class="ta-list" id="ha-list" style="display: none"></div>

      <div class="ta-loading" id="ha-loading" role="status">
        <sp-settings-section aria-hidden="true">${skeletonRow.repeat(8)}</sp-settings-section>
        <p>${t('ta_loading', 'Loading apps...')}</p>
      </div>
    </div>

    <md-fab id="ha-apply" class="ta-fab" label="${t('ta_apply', 'Apply')}">
      <md-icon slot="icon">check</md-icon>
    </md-fab>
  `;
}

export async function openHmaAppsManager() {
  if (document.querySelector('.ha-overlay')) return;
  await import('./material-subpages.js');
  const overlay = document.createElement('div');
  overlay.className = 'ta-overlay ha-overlay';
  overlay.innerHTML = buildOverlayHTML();

  let apps: HmaApp[] = [];
  let filteredApps: HmaApp[] = [];
  let currentFilter: 'all' | 'selected' | 'not_selected' = 'all';
  let currentSearch = '';
  let showSystemApps = false;
  let sysPkgs: string[] = [];
  let mode: Mode = 'scope';

  const iconMgr = new AppIconManager();

  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('ta-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ overlay: 'hma-apps' }, '');
  appendToOutput('[HMA] Opened HMA-OSS Scope overlay');

  const list = overlay.querySelector('#ha-list') as HTMLElement;
  const loading = overlay.querySelector('#ha-loading') as HTMLElement;
  const searchInput = overlay.querySelector('#ha-search') as MdOutlinedTextField;
  const titleEl = overlay.querySelector('.ha-title') as HTMLElement;
  const headerEl = overlay.querySelector('.ha-header') as HTMLElement;
  const searchContainer = overlay.querySelector('.ha-search-container') as HTMLElement;
  const searchBtn = overlay.querySelector('#ha-search-btn') as HTMLButtonElement;
  const searchClearBtn = overlay.querySelector('#ha-search-clear') as HTMLElement;
  let searchOpen = false;

  const filterOptions = (): FilterOption[] => [
    { value: 'all', label: t('ta_filter_all', 'All') },
    {
      value: 'selected',
      label: mode === 'blacklist' ? t('bl_filter_blacklisted', 'Blacklisted') : t('ta_filter_selected', 'Selected'),
    },
    {
      value: 'not_selected',
      label: mode === 'blacklist' ? t('bl_filter_not_blacklisted', 'Not Blacklisted') : t('ta_filter_not_selected', 'Not Selected'),
    },
  ];

  const filterDropdown: FilterDropdownHandle = createFilterDropdown({
    id: 'ha-state-filter',
    ariaLabel: t('ta_filter_aria', 'Filter apps by selection'),
    value: currentFilter,
    options: filterOptions(),
    onChange: (value) => {
      currentFilter = value as typeof currentFilter;
      applyFilters();
    },
  });

  overlay.querySelector('#ha-filters')!.appendChild(filterDropdown.element);
  list.addEventListener('scroll', maybeAppendMore, { passive: true });
  const scopeMap = new Map<string, AppState>();
  let blPkgs = new Set<string>();

  let cleanupA11y = () => {};
  let closed = false;
  function closeOverlay() {
    if (closed) return;
    closed = true;
    cleanupA11y();
    filterDropdown.dispose();
    chunkObserver?.disconnect();
    iconMgr.destroy();
    window.isOverlayOpen = false;
    searchOpen = false;
    window.removeEventListener('popstate', onPopState);
    overlay.classList.remove('ta-overlay--open');
    document.documentElement.style.overflow = '';
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function onPopState(e: PopStateEvent) {
    if (searchOpen) {
      exitSearch();
    } else if (mode === 'blacklist' && (!e.state || e.state.mode !== 'blacklist')) {
      switchToScopeMode();
    } else if (e.state && (e.state.overlay === 'hma-apps' || e.state.subpage)) {
      return;
    } else {
      closeOverlay();
    }
  }

  cleanupA11y = setupOverlayA11y(overlay, {
    titleId: 'ha-title',
    onClose: closeOverlay,
    initialFocus: overlay.querySelector('#ha-back'),
  });

  overlay.querySelector('#ha-back')!.addEventListener('click', () => {
    if (mode === 'blacklist') {
      switchToScopeMode();
      if (history.state?.mode === 'blacklist') {
        history.back();
      }
    } else {
      history.back();
    }
  });

  wireMenuTrigger(
    overlay.querySelector('#ha-menu-btn'),
    overlay.querySelector('#ha-menu') as MdMenu | null,
  );

  function closeTapMenu() {
    const menu = overlay.querySelector('#ha-menu') as MdMenu | null;
    closeMenu(menu);
  }

  function setMode(newMode: Mode) {
    mode = newMode;
    appendToOutput(`[HMA] Switched to ${newMode === 'blacklist' ? 'blacklist' : 'scope'} mode`);
    const toggleItem = overlay.querySelector('#ha-toggle-system') as HTMLElement;
    const toggleHeadline = toggleItem?.querySelector('[slot="headline"]');
    const modeItem = overlay.querySelector('#ha-toggle-mode') as HTMLElement;
    const modeHeadline = modeItem?.querySelector('[slot="headline"]');

    if (mode === 'blacklist') {
      titleEl.textContent = t('bl_title', 'Blacklist');
      if (modeHeadline) modeHeadline.textContent = t('ha_edit_scope', 'Back to scope');
      if (showSystemApps && toggleHeadline) {
        toggleHeadline.textContent = t('ta_hide_system', 'Hide system apps');
      }
    } else {
      titleEl.textContent = t('ha_title', 'HMA-OSS Scope');
      if (modeHeadline) modeHeadline.textContent = t('ta_edit_blacklist', 'Edit blacklist');
    }
    currentFilter = 'all';
    filterDropdown.setOptions(filterOptions());
    filterDropdown.setValue('all');
    applyFilters();
  }

  overlay.querySelector('#ha-refresh')!.addEventListener('click', () => {
    closeTapMenu();
    void refreshApps();
  });

  overlay.querySelector('#ha-select-all')!.addEventListener('click', () => {
    const on: AppState = mode === 'blacklist' ? 'blacklisted' : 'targeted';
    for (const app of apps) {
      app.state = on;
      if (mode === 'blacklist') scopeMap.delete(app.packageName);
    }
    appendToOutput('[HMA] Selected all apps');
    applyFilters();
    closeTapMenu();
  });

  overlay.querySelector('#ha-deselect-all')!.addEventListener('click', () => {
    for (const app of apps) app.state = 'unchecked';
    appendToOutput('[HMA] Deselected all apps');
    applyFilters();
    closeTapMenu();
  });

  overlay.querySelector('#ha-regenerate')!.addEventListener('click', () => {
    closeTapMenu();
    openHmaRegenerateDialog(refreshApps, loading, list);
  });

  function switchToBlacklistMode() {
    appendToOutput('[HMA] Loading blacklist...');
    exec(`cat ${specterDir()}/blacklist.txt 2>/dev/null || echo ""`).then(({ stdout }) => {
      blPkgs = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean));
      appendToOutput(`[HMA] Loaded ${blPkgs.size} blacklisted entries`);
      for (const app of apps) {
        app.state = blPkgs.has(app.packageName) ? 'blacklisted' : 'unchecked';
      }
      setMode('blacklist');
    });
  }

  function switchToScopeMode() {
    setMode('scope');
    appendToOutput('[HMA] Reloading scope states...');
    readScopeList().then(async (stdout) => {
      const currentBl = new Set<string>();
      for (const app of apps) {
        if (app.state === 'blacklisted') currentBl.add(app.packageName);
      }
      try {
        const { stdout: blStdout } = await exec(`cat ${specterDir()}/blacklist.txt 2>/dev/null || echo ""`);
        for (const pkg of blStdout.split('\n').map(s => s.trim()).filter(Boolean)) {
          currentBl.add(pkg);
        }
      } catch {}

      const lines = stdout.split('\n').map(s => s.trim()).filter(Boolean);
      scopeMap.clear();
      for (const pkg of lines) {
        if (!currentBl.has(pkg)) scopeMap.set(pkg, 'targeted');
      }
      for (const app of apps) {
        app.state = scopeMap.has(app.packageName) ? 'targeted' : 'unchecked';
      }
      applyFilters();
    }).catch((e) => {
      appendToOutput(`[HMA] Failed to reload scope states: ${e}`, true);
    });
  }

  overlay.querySelector('#ha-toggle-mode')!.addEventListener('click', () => {
    closeTapMenu();
    if (mode === 'scope') {
      history.pushState({ overlay: 'hma-apps', mode: 'blacklist' }, '');
      switchToBlacklistMode();
    } else {
      switchToScopeMode();
      if (history.state?.mode === 'blacklist') {
        history.back();
      }
    }
  });

  overlay.querySelector('#ha-import-denylist')!.addEventListener('click', async () => {
    const { stdout } = await shellExec('magisk --denylist ls 2>/dev/null | awk -F\'|\' \'{print $1}\' | grep -v "isolated" | sort -u || echo ""');
    const pkgs = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    if (pkgs.length === 0) {
      showToast(t('ta_prompt_denylist_failed', 'Failed to read DenyList'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      appendToOutput('[HMA] DenyList: failed to read', true);
    } else {
      let count = 0;
      for (const app of apps) {
        if (pkgs.includes(app.packageName)) {
          app.state = mode === 'blacklist' ? 'blacklisted' : 'targeted';
          if (mode === 'blacklist') scopeMap.delete(app.packageName);
          count++;
        }
      }
      appendToOutput(`[HMA] Imported ${count} apps from DenyList`);
      applyFilters();
      showToast(t('ta_prompt_denylist_imported', 'DenyList apps selected'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
    }
    closeTapMenu();
  });

  overlay.querySelector('#ha-toggle-system')!.addEventListener('click', async () => {
    showSystemApps = !showSystemApps;
    appendToOutput(`[HMA] ${showSystemApps ? 'Showing' : 'Hiding'} system apps`);
    const menuItem = overlay.querySelector('#ha-toggle-system') as HTMLElement;
    const headline = menuItem.querySelector('[slot="headline"]')!;
    if (showSystemApps) {
      if (sysPkgs.length === 0) {
        const { stdout } = await shellExec('pm list packages -s 2>/dev/null | cut -d: -f2');
        sysPkgs = stdout.split('\n').map(s => s.trim()).filter(Boolean);
      }
      const existingPkgs = new Set(apps.map(a => a.packageName));
      const labelMap = await resolvePackageNames(sysPkgs);

      let blSet = new Set<string>();
      if (mode === 'blacklist') {
        const { stdout } = await shellExec(`cat ${specterDir()}/blacklist.txt 2>/dev/null || echo ""`);
        blSet = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean));
      }

      for (const pkg of sysPkgs) {
        if (!existingPkgs.has(pkg)) {
          let state: AppState = 'unchecked';
          if (mode === 'scope') state = scopeMap.get(pkg) || 'unchecked';
          else state = blSet.has(pkg) ? 'blacklisted' : 'unchecked';
          apps.push({ packageName: pkg, appName: labelMap.get(pkg) || pkg, state });
        }
      }
      apps.sort((a, b) => a.packageName.localeCompare(b.packageName));
      headline.textContent = t('ta_hide_system', 'Hide system apps');
    } else {
      headline.textContent = t('ta_show_system', 'Show system apps');
    }
    applyFilters();
    closeTapMenu();
  });

  function ingestScopeList(raw: string) {
    scopeMap.clear();
    for (const line of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
      scopeMap.set(line, 'targeted');
    }
  }

  async function replaceApps(pkgs: string[]) {
    const have = new Set(pkgs);
    const extra = [...scopeMap.keys()].filter(p => !have.has(p));
    const all = pkgs.concat(extra);
    const labelMap = await resolvePackageNames(all);
    apps.length = 0;
    for (const pkg of all) {
      apps.push({
        packageName: pkg,
        appName: labelMap.get(pkg) || pkg,
        state: scopeMap.get(pkg) || 'unchecked',
      });
    }
  }

  async function loadData() {
    try {
      const ksu = ksuGlobal();
      if (typeof ksu?.cacheAllPackageIcons === 'function') {
        try {
          ksu.cacheAllPackageIcons(48);
        } catch {}
      }

      const [scopeResult, pkgs] = await Promise.all([
        readScopeList(),
        fetchUserPackages(),
      ]);

      ingestScopeList(scopeResult);
      await replaceApps(pkgs);

      appendToOutput(`[HMA] Loaded ${apps.length} user apps, ${scopeMap.size} in HMA scope`);
      loading.style.display = 'none';
      list.style.display = '';
      applyFilters();
    } catch (e) {
      appendToOutput(`[HMA] Failed to load app data: ${e}`, true);
      loading.innerHTML = `<p class="ta-loading-error">${t('ta_load_error', 'Failed to load apps')}</p>`;
    }
  }

  async function refreshApps() {
    try {
      const [scopeResult, pkgs] = await Promise.all([
        readScopeList(),
        fetchUserPackages(),
      ]);

      ingestScopeList(scopeResult);
      await replaceApps(pkgs);

      appendToOutput(`[HMA] Refreshed ${apps.length} user apps, ${scopeMap.size} in HMA scope`);
      applyFilters();
    } catch (e) {
      appendToOutput(`[HMA] Refresh failed: ${e}`, true);
    }
  }

  function setupPullToRefresh() {
    const THRESHOLD = 80;
    const MAX_PULL = 200;
    const RESISTANCE = 0.5;

    const ptrList = overlay.querySelector('#ha-list') as HTMLElement;
    const indicator = overlay.querySelector('#ha-ptr-indicator') as HTMLElement;
    const arrow = overlay.querySelector('#ha-ptr-arrow') as HTMLElement;

    let startY = 0;
    let pulling = false;
    let triggered = false;

    function setIndicatorPull(pull: number) {
      indicator.style.transform = `translateY(${-80 + pull}px)`;
    }

    function resetIndicator() {
      indicator.style.transform = '';
      indicator.style.opacity = '0';
    }

    function doEnd() {
      pulling = false;
      indicator.classList.remove('ptr-dragging');

      const m = (indicator.style.transform || '').match(/translateY\(([-\d.]+)px\)/);
      const currentY = m ? parseFloat(m[1] ?? '') : -80;
      const pull = currentY + 80;

      if (pull >= THRESHOLD && !triggered) {
        triggered = true;
        arrow.style.display = 'none';
        indicator.style.transform = 'translateY(0px)';
        indicator.style.opacity = '1';
        refreshApps().then(() => {
          arrow.style.display = '';
          resetIndicator();
          triggered = false;
        });
      } else {
        resetIndicator();
        arrow.style.transform = '';
      }
    }

    function doCancel() {
      pulling = false;
      indicator.classList.remove('ptr-dragging');
      resetIndicator();
      arrow.style.transform = '';
    }

    const isTouch = 'ontouchstart' in window;

    const onTouchStart = (e: TouchEvent) => {
      if (ptrList.scrollTop > 0 || triggered || e.touches.length !== 1) return;
      startY = e.touches[0]!.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dy = e.touches[0]!.clientY - startY;
      if (!pulling) {
        if (dy > 0 && ptrList.scrollTop === 0) {
          pulling = true;
          indicator.classList.add('ptr-dragging');
          e.preventDefault();
        }
        return;
      }
      if (dy < 0) {
        doCancel();
        return;
      }
      e.preventDefault();
      const pull = Math.min(dy * RESISTANCE, MAX_PULL);
      const pct = Math.min(pull / THRESHOLD, 1);

      indicator.style.opacity = String(pct);
      setIndicatorPull(pull);
      arrow.style.transform = `rotate(${pct * 360}deg)`;
    };
    const onTouchEnd = () => { doEnd(); };

    const onPointerDown = (e: PointerEvent) => {
      if (isTouch) return;
      if (ptrList.scrollTop > 0 || triggered) return;
      startY = e.clientY;
      pulling = true;
      indicator.classList.add('ptr-dragging');
      ptrList.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pulling || isTouch) return;
      const dy = e.clientY - startY;
      if (dy < 0) {
        doCancel();
        return;
      }
      const pull = Math.min(dy * RESISTANCE, MAX_PULL);
      const pct = Math.min(pull / THRESHOLD, 1);

      indicator.style.opacity = String(pct);
      setIndicatorPull(pull);
      arrow.style.transform = `rotate(${pct * 360}deg)`;
    };
    const onPointerEnd = () => { if (!isTouch) doEnd(); };
    const onPointerCancel = () => { if (!isTouch) doCancel(); };

    if (isTouch) {
      ptrList.addEventListener('touchstart', onTouchStart, { passive: false });
      ptrList.addEventListener('touchmove', onTouchMove, { passive: false });
      ptrList.addEventListener('touchend', onTouchEnd);
      ptrList.addEventListener('touchcancel', doCancel);
    } else {
      ptrList.addEventListener('pointerdown', onPointerDown);
      ptrList.addEventListener('pointermove', onPointerMove);
      ptrList.addEventListener('pointerup', onPointerEnd);
      ptrList.addEventListener('pointercancel', onPointerCancel);
    }
  }

  const CHUNK_SIZE = 48;
  let renderedCount = 0;
  let listSection: HTMLElement | null = null;
  let sentinelEl: HTMLElement | null = null;
  let chunkObserver: IntersectionObserver | null = null;

  function renderList() {
    chunkObserver?.disconnect();
    chunkObserver = null;
    sentinelEl = null;
    list.innerHTML = '';
    renderedCount = 0;
    listSection = document.createElement('sp-settings-section');
    list.appendChild(listSection);
    appendChunk();

    if (filteredApps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty';
      empty.textContent = t('ta_no_results', 'No apps match your filter');
      list.appendChild(empty);
    }
  }

  function appendChunk() {
    if (!listSection) return;
    const next = filteredApps.slice(renderedCount, renderedCount + CHUNK_SIZE);
    if (next.length > 0) {
      const fragment = document.createDocumentFragment();
      for (const app of next) fragment.appendChild(buildRow(app));
      listSection.appendChild(fragment);
      renderedCount += next.length;
      iconMgr.watchAll();
    }
    syncSentinel();
  }

  function syncSentinel() {
    if (renderedCount >= filteredApps.length) {
      sentinelEl?.remove();
      sentinelEl = null;
      chunkObserver?.disconnect();
      return;
    }
    if (!sentinelEl) {
      sentinelEl = document.createElement('div');
      sentinelEl.className = 'ta-sentinel';
      sentinelEl.setAttribute('aria-hidden', 'true');
      list.appendChild(sentinelEl);
    }
    if (typeof IntersectionObserver === 'function') {
      if (!chunkObserver) {
        chunkObserver = new IntersectionObserver((entries) => {
          if (entries.some(entry => entry.isIntersecting)) appendChunk();
        }, { root: list, rootMargin: '600px' });
      }
      chunkObserver.observe(sentinelEl);
    }
  }

  function maybeAppendMore() {
    if (!sentinelEl || renderedCount >= filteredApps.length) return;
    const rect = sentinelEl.getBoundingClientRect();
    if (rect.top < list.getBoundingClientRect().bottom + 600) appendChunk();
  }

  function buildRow(app: HmaApp): HTMLElement {
    const item = document.createElement('sp-settings-row');
    item.setAttribute('variant', 'custom');
    item.className = 'ta-item';
    item.dataset.package = app.packageName;
    item.dataset.state = app.state;
    item.setAttribute('role', 'button');
    item.tabIndex = 0;

    const { wrap: iconContainer } = iconMgr.createElements(app.packageName);
    iconContainer.setAttribute('slot', 'leading');

    const nameEl = document.createElement('span');
    nameEl.setAttribute('slot', 'headline');
    nameEl.className = 'ta-item-name';
    nameEl.textContent = app.appName;

    const pkgEl = document.createElement('span');
    pkgEl.setAttribute('slot', 'supporting');
    pkgEl.className = 'ta-item-pkg';
    pkgEl.textContent = app.packageName;

    const circle = document.createElement('div');
    circle.setAttribute('slot', 'trailing');
    circle.className = 'ta-state-circle';
    circle.setAttribute('data-state', app.state);
    circle.setAttribute('aria-hidden', 'true');

    const stateIcon = stateIcons(app.state, mode);
    item.setAttribute('aria-label', `${app.appName}, ${t(stateLabelKey(app.state, mode), app.state)}`);
    circle.innerHTML = stateIcon ? `<md-icon class="ta-state-icon">${stateIcon}</md-icon>` : '';

    function applyAppState(newState: AppState) {
      app.state = newState;
      if (mode === 'blacklist' && newState === 'blacklisted') {
        scopeMap.delete(app.packageName);
      }
      circle.setAttribute('data-state', newState);
      item.setAttribute('aria-label', `${app.appName}, ${t(stateLabelKey(newState, mode), newState)}`);
      const iconEl = circle.querySelector('.ta-state-icon');
      const ni = stateIcons(newState, mode);
      if (iconEl) {
        if (ni) {
          iconEl.outerHTML = `<md-icon class="ta-state-icon">${ni}</md-icon>`;
        } else {
          iconEl.remove();
        }
      } else if (ni) {
        circle.insertAdjacentHTML('beforeend', `<md-icon class="ta-state-icon">${ni}</md-icon>`);
      }
      item.dataset.state = newState;
      circle.classList.remove('ta-state-circle--anim');
      void circle.offsetWidth;
      circle.classList.add('ta-state-circle--anim');
    }

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mode === 'blacklist') {
        applyAppState(app.state === 'blacklisted' ? 'unchecked' : 'blacklisted');
      } else {
        applyAppState(app.state === 'targeted' ? 'unchecked' : 'targeted');
      }
    });

    item.addEventListener('click', () => {
      if (mode === 'blacklist') {
        applyAppState(app.state === 'blacklisted' ? 'unchecked' : 'blacklisted');
      } else {
        applyAppState(app.state === 'targeted' ? 'unchecked' : 'targeted');
      }
    });
    item.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      item.click();
    });

    item.appendChild(iconContainer);
    item.appendChild(nameEl);
    item.appendChild(pkgEl);
    item.appendChild(circle);
    return item;
  }

  function applyFilters() {
    let result = apps;

    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      result = result.filter(a =>
        a.packageName.toLowerCase().includes(q) || a.appName.toLowerCase().includes(q)
      );
    }

    if (!showSystemApps && sysPkgs.length) {
      const sysSet = new Set(sysPkgs);
      result = result.filter(a => !sysSet.has(a.packageName) || a.state !== 'unchecked');
    }

    if (currentFilter === 'selected') {
      result = result.filter(a => (mode === 'blacklist' ? a.state === 'blacklisted' : a.state !== 'unchecked'));
    } else if (currentFilter === 'not_selected') {
      result = result.filter(a => a.state === 'unchecked');
    }

    result.sort((a, b) => {
      const aSelected = a.state !== 'unchecked' ? 0 : 1;
      const bSelected = b.state !== 'unchecked' ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return a.appName.localeCompare(b.appName);
    });

    filteredApps = result;
    renderList();
  }

  searchInput.addEventListener('input', () => {
    currentSearch = (searchInput.value || '').trim();
    syncSearchClear();
    applyFilters();
  });

  function syncSearchClear() {
    searchClearBtn.style.display = searchInput.value ? '' : 'none';
  }

  function openSearch() {
    if (searchOpen) return;
    searchOpen = true;
    history.pushState({ overlay: 'hma-apps', mode, search: true }, '');
    headerEl.classList.add('ta-header--searching');
    searchContainer.hidden = false;
    searchBtn.setAttribute('aria-expanded', 'true');
    searchInput.focus();
  }

  function exitSearch() {
    if (!searchOpen) return;
    searchOpen = false;
    headerEl.classList.remove('ta-header--searching');
    searchContainer.hidden = true;
    searchBtn.setAttribute('aria-expanded', 'false');
    if (currentSearch) {
      searchInput.value = '';
      currentSearch = '';
      syncSearchClear();
      applyFilters();
    }
  }

  searchBtn.addEventListener('click', openSearch);

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    syncSearchClear();
    applyFilters();
    searchInput.focus();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      e.stopPropagation();
      history.back();
    }
  });

  const applyBtn = overlay.querySelector('#ha-apply') as (HTMLElement & { disabled: boolean; label?: string });
  applyBtn.addEventListener('click', async () => {
    if (applyBtn.disabled) return;
    applyBtn.disabled = true;

    const originalLabel = t('ta_apply', 'Apply');
    applyBtn.label = t('ta_applying', 'Applying…');
    applyBtn.setAttribute('label', t('ta_applying', 'Applying…'));

    const loadingToast = showLoadingToast(t('ta_applying', 'Applying…'));

    // Yield so WebView can paint the loading toast and busy state before bridge exec calls
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    if (mode === 'blacklist') {
      const bl = apps.filter(a => a.state === 'blacklisted').map(a => a.packageName).sort();
      const blSet = new Set(bl);
      for (const pkg of blSet) {
        scopeMap.delete(pkg);
      }

      try {
        const content = bl.join('\n');
        const result = await spawnCommand(`printf '%s' ${shellEscape(content)} | base64 -w0`);
        const b64 = result.stdout || '';
        await spawnCommand(`mkdir -p ${specterDir()} && printf '%s' "${b64}" | base64 -d > ${specterDir()}/blacklist.txt`);
        await spawnCommand(`mkdir -p ${specterDir()} && touch ${specterDir()}/blacklist_enabled`);
        appendToOutput(`[HMA] Wrote ${bl.length} entries to blacklist.txt`);

        try {
          const rawScope = await readScopeList();
          const scopeLines = rawScope.split('\n').map(s => s.trim()).filter(Boolean);
          const prunedLines = scopeLines.filter(pkg => !blSet.has(pkg));
          if (prunedLines.length !== scopeLines.length) {
            await writeScopeList(prunedLines.join('\n'));
            appendToOutput(`[HMA] Pruned ${scopeLines.length - prunedLines.length} blacklisted entries from scope list`);
          }
        } catch (te) {
          appendToOutput(`[HMA] Warning: could not prune scope list: ${te}`, true);
        }

        updateToast(loadingToast, t('toast_blacklist_saved', 'Blacklist saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        applyBtn.label = t('ta_applied', 'Applied');
        applyBtn.setAttribute('label', t('ta_applied', 'Applied'));
        setTimeout(() => {
          applyBtn.label = originalLabel;
          applyBtn.setAttribute('label', originalLabel);
          applyBtn.disabled = false;
        }, 1500);
      } catch (e) {
        appendToOutput(`[HMA] Failed to save blacklist: ${e}`, true);
        updateToast(loadingToast, t('simple_toast_error', 'Failed') + ': ' + e, { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        applyBtn.label = originalLabel;
        applyBtn.setAttribute('label', originalLabel);
        applyBtn.disabled = false;
      }
      return;
    }

    const lines = apps
      .filter(a => a.state === 'targeted')
      .map(a => a.packageName)
      .sort();

    try {
      const content = lines.join('\n');
      await writeScopeList(content);
      appendToOutput(`[HMA] Wrote HMA-OSS scope (${lines.length} targets)`);
      updateToast(loadingToast, t('ha_prompt_saved', 'HMA-OSS scope saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      applyBtn.label = t('ta_applied', 'Applied');
      applyBtn.setAttribute('label', t('ta_applied', 'Applied'));
      setTimeout(() => {
        applyBtn.label = originalLabel;
        applyBtn.setAttribute('label', originalLabel);
        applyBtn.disabled = false;
      }, 1500);
    } catch (e) {
      appendToOutput(`[HMA] Failed to save HMA scope list: ${e}`, true);
      updateToast(loadingToast, t('simple_toast_error', 'Failed') + ': ' + e, { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      applyBtn.label = originalLabel;
      applyBtn.setAttribute('label', originalLabel);
      applyBtn.disabled = false;
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (history.state && history.state.overlay === 'hma-apps') history.back();
    else closeOverlay();
  });

  window.addEventListener('popstate', onPopState);

  setupPullToRefresh();
  await new Promise<void>(resolve => afterPaint(resolve, 300));
  await loadData();
}
