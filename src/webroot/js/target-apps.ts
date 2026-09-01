import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';
import '@material/web/switch/switch.js';
import { exec, getModuleDir, getDataDir } from './bridge.js';
import { cfgGet } from './cfg.js';
import { shellEscape, fetchJson } from './utils.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';
import { appendToOutput } from './terminal.js';
import { API_URLS } from './constants.js';
import type { KeystoreManagerJson } from './types.js';
import { AppIconManager, ksuGlobal } from './target-apps-icons.js';
import { openTeesimModeDialog, openModeDialog, openRegenerateDialog } from './target-apps-dialogs.js';
import type { TargetDialogsContext } from './target-apps-dialogs.js';

export type TargetState = 'unchecked' | 'bare' | 'conditional' | 'force';
type BlacklistState = 'unchecked' | 'blacklisted';
export type AppState = TargetState | BlacklistState;
type Mode = 'target' | 'blacklist';
export type KsmFormat = 'txt' | 'toml' | 'json' | '';

export interface TargetApp {
  packageName: string;
  appName: string;
  state: AppState;
}


const TARGET_MODE_ORDER: TargetState[] = ['bare', 'conditional', 'force'];
const BLACKLIST_STATE_ORDER: BlacklistState[] = ['unchecked', 'blacklisted'];

const TARGET_ICONS: Record<string, string> = {
  unchecked: '', bare: 'done', conditional: '', force: '',
};
const TARGET_TEXT: Record<string, string> = {
  unchecked: '', bare: '', conditional: '?', force: '!',
};
const TARGET_LABEL_KEYS: Record<string, string> = {
  unchecked: 'ta_state_unchecked', bare: 'ta_state_bare',
  conditional: 'ta_state_conditional', force: 'ta_state_force',
};

const BLACKLIST_ICONS: Record<string, string> = {
  unchecked: '', blacklisted: 'block',
};
const BLACKLIST_TEXT: Record<string, string> = {
  unchecked: '', blacklisted: '',
};
const BLACKLIST_LABEL_KEYS: Record<string, string> = {
  unchecked: 'bl_state_not_blacklisted', blacklisted: 'bl_state_blacklisted',
};

const specterDir = () => getDataDir() || '/data/adb/specter';

// target.txt (Tricky Store) / injector.toml (OhMyKeymint) — both via target.sh.
function targetScript(): string {
  const moddir = getModuleDir();
  if (!moddir) throw new Error('module dir unavailable');
  return shellEscape(moddir + '/features/target.sh');
}

async function readTargetList(): Promise<string> {
  const { stdout } = await exec(`sh ${targetScript()} --list-raw 2>/dev/null || echo ""`);
  return stdout || '';
}

async function writeTargetList(content: string): Promise<void> {
  if (content && !content.endsWith('\n')) content += '\n';
  const staging = `${specterDir()}/.target_staging`;
  const encoded = await exec(`printf '%s' ${shellEscape(content)} | base64 -w0`);
  const written = await exec(
    `mkdir -p ${specterDir()} && printf '%s' "${encoded.stdout || ''}" | base64 -d > ${shellEscape(staging)}`
  );
  if (written.code !== 0) throw new Error(written.stderr || 'failed to stage target list');
  const committed = await exec(`sh ${targetScript()} --set ${shellEscape(staging)}`);
  if (committed.code !== 0) throw new Error(committed.stderr || 'failed to commit target list');
  await exec(`rm -f ${shellEscape(staging)}`);
}

function t(key: string, fallback: string): string {
  return getTranslation(key) || fallback;
}

function nextState(current: AppState): AppState {
  const idx = BLACKLIST_STATE_ORDER.indexOf(current as BlacklistState);
  return BLACKLIST_STATE_ORDER[(idx + 1) % BLACKLIST_STATE_ORDER.length]!;
}

function stateIcons(state: AppState, mode: Mode): string {
  return mode === 'blacklist' ? BLACKLIST_ICONS[state] || '' : TARGET_ICONS[state] || '';
}

function stateText(state: AppState, mode: Mode): string {
  return mode === 'blacklist' ? BLACKLIST_TEXT[state] || '' : TARGET_TEXT[state] || '';
}

function stateLabelKey(state: AppState, mode: Mode): string {
  if (mode === 'blacklist') return BLACKLIST_LABEL_KEYS[state] || 'unchecked';
  return TARGET_LABEL_KEYS[state] || 'unchecked';
}



async function shellExec(cmd: string): Promise<{ stdout: string }> {
  try { return await exec(cmd); } catch { return { stdout: '' }; }
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
  const r = await shellExec('pm list packages -3 2>/dev/null | cut -d: -f2');
  for (const pkg of r.stdout.split('\n').map(s => s.trim()).filter(Boolean)) {
    pkgSet.add(pkg);
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

function buildOverlayHTML(): string {
  return `
    <div class="ta-inner">
      <div class="ptr-indicator" id="ptr-indicator">
        <div class="ptr-progress-wrap">
          <md-icon id="ptr-arrow" class="ptr-arrow">refresh</md-icon>
        </div>
      </div>
      <div class="ta-header">
        <button id="ta-back" class="ta-back-btn">
          <md-icon>arrow_back</md-icon>
        </button>
        <h2 class="ta-title">${t('ta_title', 'App Targeting')}</h2>
        <button id="ta-menu-btn" class="ta-menu-btn" aria-label="More options" data-i18n-aria="ta_menu_more">
          <md-icon>more_vert</md-icon>
        </button>
        <md-menu id="ta-menu" class="ta-menu" anchor="ta-menu-btn" positioning="fixed">
          <md-menu-item id="ta-select-all" class="first">
            <div slot="headline">${t('ta_select_all', 'Select All')}</div>
          </md-menu-item>
          <md-menu-item id="ta-deselect-all">
            <div slot="headline">${t('ta_deselect_all', 'Deselect All')}</div>
          </md-menu-item>
          <md-menu-item id="ta-mode">
            <div slot="headline">${t('ta_mode_menu', 'Default Mode')}</div>
          </md-menu-item>
          <md-menu-item id="ta-regenerate">
            <div slot="headline">${t('ta_regenerate', 'Regenerate')}</div>
          </md-menu-item>
          <md-menu-item id="ta-toggle-system">
            <div slot="headline">${t('ta_show_system', 'Show system apps')}</div>
          </md-menu-item>
          <md-menu-item id="ta-toggle-mode">
            <div slot="headline">${t('ta_edit_blacklist', 'Edit blacklist')}</div>
          </md-menu-item>
          <md-menu-item id="ta-import-denylist" class="last">
            <div slot="headline">${t('ta_import_denylist', 'Import from DenyList')}</div>
          </md-menu-item>
        </md-menu>
      </div>

      <div class="ta-search-container">
        <md-outlined-text-field id="ta-search" class="ta-search" placeholder="${t('ta_search_placeholder', 'Search apps')}">
          <md-icon slot="leading-icon">search</md-icon>
        </md-outlined-text-field>
      </div>

      <div class="ta-filters">
        <md-filter-chip id="ta-filter-all" label="${t('ta_filter_all', 'All')}" selected>
          <md-icon slot="icon">select_all</md-icon>
        </md-filter-chip>
        <md-filter-chip id="ta-filter-selected" label="${t('ta_filter_selected', 'Selected')}">
          <md-icon slot="icon">check_circle</md-icon>
        </md-filter-chip>
        <md-filter-chip id="ta-filter-not-selected" label="${t('ta_filter_not_selected', 'Not Selected')}">
          <md-icon slot="icon">radio_button_unchecked</md-icon>
        </md-filter-chip>
      </div>

      <div class="ta-list" id="ta-list"></div>
    </div>

    <div class="ta-loading" id="ta-loading">
      <md-circular-progress indeterminate></md-circular-progress>
      <p>${t('ta_loading', 'Loading apps...')}</p>
    </div>

    <md-fab id="ta-apply" class="ta-fab" label="${t('ta_apply', 'Apply')}">
      <md-icon slot="icon">check</md-icon>
    </md-fab>
  `;
}


export async function openTargetAppsManager() {
  const overlay = document.createElement('div');
  overlay.className = 'ta-overlay';
  overlay.innerHTML = buildOverlayHTML();

  let apps: TargetApp[] = [];
  let filteredApps: TargetApp[] = [];
  let currentFilter: 'all' | 'selected' | 'not_selected' = 'all';
  let currentSearch = '';
  let showSystemApps = false;
  let sysPkgs: string[] = [];
  let mode: Mode = 'target';
  let defaultMode = 'bare';
  let ksmFormat: KsmFormat = 'txt';
  let supportsPerAppMode = true;

  const iconMgr = new AppIconManager();

  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('ta-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ overlay: 'target-apps' }, '');
  appendToOutput('[TARGET] Opened App Targeting overlay');

  const list = overlay.querySelector('#ta-list') as HTMLElement;
  const loading = overlay.querySelector('#ta-loading') as HTMLElement;
  const searchInput = overlay.querySelector('#ta-search') as MdOutlinedTextField;
  const titleEl = overlay.querySelector('.ta-title') as HTMLElement;
  const targetMap = new Map<string, AppState>();
  let blPkgs = new Set<string>();

  function closeOverlay() {
    iconMgr.destroy();
    window.isOverlayOpen = false;
    window.removeEventListener('popstate', closeOverlay);
    overlay.classList.remove('ta-overlay--open');
    document.documentElement.style.overflow = '';
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  overlay.querySelector('#ta-back')!.addEventListener('click', () => history.back());

  overlay.querySelector('#ta-menu-btn')!.addEventListener('click', () => {
    const menu = overlay.querySelector('#ta-menu') as MdMenu;
    menu.open = !menu.open;
  });

  function closeTapMenu() {
    const menu = overlay.querySelector('#ta-menu') as MdMenu | null;
    if (menu?.open) menu.open = false;
  }

  function setMode(newMode: Mode) {
    mode = newMode;
    appendToOutput(`[TARGET] Switched to ${newMode === 'blacklist' ? 'blacklist' : 'target'} mode`);
    const toggleItem = overlay.querySelector('#ta-toggle-system') as HTMLElement;
    const toggleHeadline = toggleItem?.querySelector('[slot="headline"]');
    const modeItem = overlay.querySelector('#ta-toggle-mode') as HTMLElement;
    const modeHeadline = modeItem?.querySelector('[slot="headline"]');
    const filterSel = overlay.querySelector('#ta-filter-selected') as MdFilterChip | null;
    const filterNot = overlay.querySelector('#ta-filter-not-selected') as MdFilterChip | null;

    if (mode === 'blacklist') {
      titleEl.textContent = t('bl_title', 'Blacklist');
      if (modeHeadline) modeHeadline.textContent = t('ta_edit_target', 'Back to targeting');
      if (filterSel) { filterSel.label = t('bl_filter_blacklisted', 'Blacklisted'); filterSel.icon = 'block'; }
      if (filterNot) { filterNot.label = t('bl_filter_not_blacklisted', 'Not Blacklisted'); filterNot.icon = 'radio_button_unchecked'; }
      if (showSystemApps && toggleHeadline) {
        toggleHeadline.textContent = t('ta_hide_system', 'Hide system apps');
      }
    } else {
      titleEl.textContent = t('ta_title', 'App Targeting');
      if (modeHeadline) modeHeadline.textContent = t('ta_edit_blacklist', 'Edit blacklist');
      if (filterSel) { filterSel.label = t('ta_filter_selected', 'Selected'); filterSel.icon = 'check_circle'; }
      if (filterNot) { filterNot.label = t('ta_filter_not_selected', 'Not Selected'); filterNot.icon = 'radio_button_unchecked'; }
    }
    currentFilter = 'all';
    overlay.querySelectorAll('.ta-filters md-filter-chip').forEach(c => { (c as MdFilterChip).selected = false; });
    (overlay.querySelector('#ta-filter-all') as MdFilterChip).selected = true;
    applyFilters();
  }

  overlay.querySelector('#ta-select-all')!.addEventListener('click', () => {
    const on = mode === 'blacklist' ? 'blacklisted' : (supportsPerAppMode ? (defaultMode as AppState) : 'bare');
    for (const app of apps) app.state = on;
    appendToOutput(`[TARGET] Selected all apps`);
    applyFilters();
    closeTapMenu();
  });

  overlay.querySelector('#ta-deselect-all')!.addEventListener('click', () => {
    for (const app of apps) app.state = 'unchecked';
    appendToOutput(`[TARGET] Deselected all apps`);
    applyFilters();
    closeTapMenu();
  });

  overlay.querySelector('#ta-toggle-mode')!.addEventListener('click', () => {
    closeTapMenu();
    if (mode === 'target') {
      appendToOutput('[TARGET] Loading blacklist...');
      exec(`cat ${specterDir()}/blacklist.txt 2>/dev/null || echo ""`).then(({ stdout }) => {
        blPkgs = new Set(stdout.split('\n').map(s => s.trim()).filter(Boolean));
        appendToOutput(`[TARGET] Loaded ${blPkgs.size} blacklisted entries`);
        for (const app of apps) {
          app.state = blPkgs.has(app.packageName) ? 'blacklisted' : 'unchecked';
        }
        setMode('blacklist');
      });
    } else {
      setMode('target');
      appendToOutput('[TARGET] Reloading target states...');
      readTargetList().then((stdout) => {
        const lines = stdout.split('\n').map(s => s.trim()).filter(Boolean);
        targetMap.clear();
        for (const line of lines) {
          if (line.endsWith('!')) targetMap.set(line.slice(0, -1), 'force');
          else if (line.endsWith('?')) targetMap.set(line.slice(0, -1), 'conditional');
          else targetMap.set(line, 'bare');
        }
        for (const app of apps) {
          if (!targetMap.has(app.packageName)) continue;
          app.state = targetMap.get(app.packageName)!;
        }
        applyFilters();
      });
    }
  });

  overlay.querySelector('#ta-import-denylist')!.addEventListener('click', async () => {
    const { stdout } = await shellExec('magisk --denylist ls 2>/dev/null | awk -F\'|\' \'{print $1}\' | grep -v "isolated" | sort -u || echo ""');
    const pkgs = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    if (pkgs.length === 0) {
      showToast(t('ta_prompt_denylist_failed', 'Failed to read DenyList'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      appendToOutput('[TARGET] DenyList: failed to read', true);
    } else {
      let count = 0;
      for (const app of apps) {
        if (pkgs.includes(app.packageName)) {
          app.state = mode === 'blacklist' ? 'blacklisted' : 'bare';
          count++;
        }
      }
      appendToOutput(`[TARGET] Imported ${count} apps from DenyList`);
      applyFilters();
      showToast(t('ta_prompt_denylist_imported', 'DenyList apps selected'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
    }
    closeTapMenu();
  });

  const dialogsCtx: TargetDialogsContext = {
    apps,
    getDefaultMode: () => defaultMode,
    setDefaultMode: (m: string) => { defaultMode = m; },
    applyFilters,
    refreshApps,
    loading,
    list,
  };

  overlay.querySelector('#ta-regenerate')!.addEventListener('click', () => {
    closeTapMenu();
    openRegenerateDialog(dialogsCtx);
  });

  overlay.querySelector('#ta-mode')!.addEventListener('click', () => {
    closeTapMenu();
    if (ksmFormat === 'json') openTeesimModeDialog();
    else if (supportsPerAppMode) openModeDialog(dialogsCtx);
  });





  overlay.querySelector('#ta-toggle-system')!.addEventListener('click', async () => {
    showSystemApps = !showSystemApps;
    appendToOutput(`[TARGET] ${showSystemApps ? 'Showing' : 'Hiding'} system apps`);
    const menuItem = overlay.querySelector('#ta-toggle-system') as HTMLElement;
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
          if (mode === 'target') state = targetMap.get(pkg) || 'unchecked';
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

  function ingestTargetList(raw: string) {
    targetMap.clear();
    for (const line of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
      if (supportsPerAppMode && line.endsWith('!')) targetMap.set(line.slice(0, -1), 'force');
      else if (supportsPerAppMode && line.endsWith('?')) targetMap.set(line.slice(0, -1), 'conditional');
      else targetMap.set(line.replace(/[!?]$/, ''), 'bare');
    }
  }

  async function replaceApps(pkgs: string[]) {
    const have = new Set(pkgs);
    const extra = [...targetMap.keys()].filter(p => !have.has(p));
    const all = pkgs.concat(extra);
    const labelMap = await resolvePackageNames(all);
    apps.length = 0;
    for (const pkg of all) {
      apps.push({
        packageName: pkg,
        appName: labelMap.get(pkg) || pkg,
        state: targetMap.get(pkg) || 'unchecked',
      });
    }
  }

  async function loadData() {
    try {
      const ksu = ksuGlobal();
      if (typeof ksu?.cacheAllPackageIcons === 'function') {
        try { ksu.cacheAllPackageIcons(48); } catch {}
      }
      let perAppModes: boolean | undefined;
      try {
        const km = await fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!, 0);
        const fmt = km?.format || '';
        ksmFormat = fmt === 'json' || fmt === 'toml' || fmt === 'txt' ? fmt : 'txt';
        perAppModes = km?.perAppModes;
      } catch {
        ksmFormat = 'txt';
      }
      // Contract flag from keystore_manager.json; format sniff only as a
      // fallback for stale info files written by older Specter versions.
      supportsPerAppMode = perAppModes ?? (ksmFormat === 'txt');
      const modeItem = overlay.querySelector('#ta-mode') as HTMLElement | null;
      if (modeItem) {
        modeItem.hidden = ksmFormat === 'toml';
        if (!modeItem.hidden && ksmFormat === 'json') {
          try {
            const { stdout } = await exec(`sh ${shellEscape(getModuleDir() + '/webroot/common/conflicts.sh')} status 2>/dev/null || echo '[]'`);
            const entries = JSON.parse(stdout) as Array<{ key: string; prioritySpecter: boolean }>;
            const te = entries.find(e => e.key === 'teesim');
            if (te && !te.prioritySpecter) modeItem.hidden = true;
          } catch {}
        }
        const headline = modeItem.querySelector('[slot="headline"]');
        if (headline) {
          headline.textContent = ksmFormat === 'json'
            ? t('ta_teesim_mode_title', 'Operation Mode')
            : t('ta_mode_menu', 'Default Mode');
        }
      }
      if (!supportsPerAppMode) defaultMode = 'bare';
      else defaultMode = (await cfgGet('target_default_mode', 'bare')) || 'bare';

      const [targetResult, pkgs] = await Promise.all([
        readTargetList(),
        fetchUserPackages(),
      ]);

      ingestTargetList(targetResult);
      await replaceApps(pkgs);

      appendToOutput(`[TARGET] Loaded ${apps.length} user apps, ${targetMap.size} in target list`);
      loading.style.display = 'none';
      list.style.display = '';
      applyFilters();
    } catch (e) {
      appendToOutput(`[TARGET] Failed to load app data: ${e}`, true);
      loading.innerHTML = `<p>${t('ta_load_error', 'Failed to load apps')}</p>`;
    }
  }

  async function refreshApps() {
    try {
      defaultMode = (await cfgGet('target_default_mode', 'bare')) || 'bare';
      const [targetResult, pkgs] = await Promise.all([
        readTargetList(),
        fetchUserPackages(),
      ]);

      ingestTargetList(targetResult);
      await replaceApps(pkgs);

      appendToOutput(`[TARGET] Refreshed ${apps.length} user apps, ${targetMap.size} in target.txt`);
      applyFilters();
    } catch (e) {
      appendToOutput(`[TARGET] Refresh failed: ${e}`, true);
    }
  }

  function setupPullToRefresh() {
    const THRESHOLD = 80;
    const MAX_PULL = 200;
    const RESISTANCE = 0.5;

    const ptrList = overlay.querySelector('#ta-list') as HTMLElement;
    const indicator = overlay.querySelector('#ptr-indicator') as HTMLElement;
    const arrow = overlay.querySelector('#ptr-arrow') as HTMLElement;

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

    // Touch events (mobile)
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

    // Pointer events (desktop fallback)
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

  function renderList() {
    list.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (const app of filteredApps) {
      const item = document.createElement('div');
      item.className = 'ta-item';
      item.dataset.package = app.packageName;
      item.dataset.state = app.state;

      const { wrap: iconContainer } = iconMgr.createElements(app.packageName);

      const label = document.createElement('div');
      label.className = 'ta-item-content';

      const nameEl = document.createElement('div');
      nameEl.className = 'ta-item-name';
      nameEl.textContent = app.appName;

      const pkgEl = document.createElement('div');
      pkgEl.className = 'ta-item-pkg';
      pkgEl.textContent = app.packageName;

      label.appendChild(nameEl);
      label.appendChild(pkgEl);

      const circle = document.createElement('div');
      circle.className = 'ta-state-circle';
      circle.setAttribute('data-state', app.state);
      circle.setAttribute('aria-label', t(stateLabelKey(app.state, mode), app.state));

      const stateIcon = stateIcons(app.state, mode);
      const stateTextVal = stateText(app.state, mode);
      circle.innerHTML = stateIcon
        ? `<md-icon class="ta-state-icon">${stateIcon}</md-icon>`
        : stateTextVal
          ? `<span class="ta-state-icon ta-state-text">${stateTextVal}</span>`
          : '';

      function applyAppState(newState: AppState) {
        app.state = newState;
        circle.setAttribute('data-state', newState);
        circle.setAttribute('aria-label', t(stateLabelKey(newState, mode), newState));
        const iconEl = circle.querySelector('.ta-state-icon');
        const ni = stateIcons(newState, mode);
        const nt = stateText(newState, mode);
        if (iconEl) {
          if (ni) {
            iconEl.outerHTML = `<md-icon class="ta-state-icon">${ni}</md-icon>`;
          } else if (nt) {
            iconEl.outerHTML = `<span class="ta-state-icon ta-state-text">${nt}</span>`;
          } else {
            iconEl.remove();
          }
        } else if (ni) {
          circle.insertAdjacentHTML('beforeend', `<md-icon class="ta-state-icon">${ni}</md-icon>`);
        } else if (nt) {
          circle.insertAdjacentHTML('beforeend', `<span class="ta-state-icon ta-state-text">${nt}</span>`);
        }
        item.dataset.state = newState;
        circle.classList.remove('ta-state-circle--anim');
        void circle.offsetWidth;
        circle.classList.add('ta-state-circle--anim');
      }

      circle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mode === 'blacklist') {
          applyAppState(nextState(app.state));
        } else if (app.state === 'unchecked') {
          applyAppState('bare');
        } else if (!supportsPerAppMode) {
          applyAppState('unchecked');
        } else {
          const idx = TARGET_MODE_ORDER.indexOf(app.state as TargetState);
          const next = TARGET_MODE_ORDER[(idx + 1) % TARGET_MODE_ORDER.length];
          if (next) applyAppState(next);
        }
      });

      item.addEventListener('click', () => {
        if (mode === 'blacklist') {
          applyAppState(app.state === 'unchecked' ? 'blacklisted' : 'unchecked');
        } else {
          const on = supportsPerAppMode ? (defaultMode as AppState) : 'bare';
          applyAppState(app.state === 'unchecked' ? on : 'unchecked');
        }
      });

      const ripple = document.createElement('md-ripple');
      item.appendChild(iconContainer);
      item.appendChild(label);
      item.appendChild(circle);
      item.appendChild(ripple);
      fragment.appendChild(item);
    }

    list.appendChild(fragment);

    if (filteredApps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty';
      empty.textContent = t('ta_no_results', 'No apps match your filter');
      list.appendChild(empty);
    }

    iconMgr.watchAll();
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
    applyFilters();
  });

  function wireFilter(id: string, filter: typeof currentFilter) {
    const chip = overlay.querySelector(id) as MdFilterChip;
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('.ta-filters md-filter-chip').forEach(c => { (c as MdFilterChip).selected = false; });
      chip.selected = true;
      currentFilter = filter;
      applyFilters();
    });
  }

  wireFilter('#ta-filter-all', 'all');
  wireFilter('#ta-filter-selected', 'selected');
  wireFilter('#ta-filter-not-selected', 'not_selected');

  const applyBtn = overlay.querySelector('#ta-apply') as HTMLButtonElement;
  applyBtn.addEventListener('click', async () => {
    if (applyBtn.disabled) return;
    applyBtn.disabled = true;
    try {
      if (mode === 'blacklist') {
        const bl = apps.filter(a => a.state === 'blacklisted').map(a => a.packageName).sort();
        const content = bl.join('\n');
        try {
          const result = await exec(`printf '%s' ${shellEscape(content)} | base64 -w0`);
          const b64 = result.stdout || '';
          await exec(`mkdir -p ${specterDir()} && printf '%s' "${b64}" | base64 -d > ${specterDir()}/blacklist.txt`);
          await exec(`mkdir -p ${specterDir()} && touch ${specterDir()}/blacklist_enabled`);
          appendToOutput(`[TARGET] Wrote ${bl.length} entries to blacklist.txt`);
          showToast(t('toast_blacklist_saved', 'Blacklist saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        } catch (e) {
          appendToOutput(`[TARGET] Failed to save blacklist: ${e}`, true);
        }
        return;
      }

      const lines = apps
        .filter(a => a.state !== 'unchecked')
        .map(a => {
          if (supportsPerAppMode && a.state === 'force') return a.packageName + '!';
          if (supportsPerAppMode && a.state === 'conditional') return a.packageName + '?';
          return a.packageName;
        })
        .sort();

      // FIXED_TARGETS are re-added by target.sh --set (pm -3 never lists them).
      const content = lines.join('\n');
      try {
        await writeTargetList(content);
        appendToOutput(`[TARGET] Wrote target list (${lines.length} selected + FIXED_TARGETS)`);
        showToast(t('ta_prompt_saved', 'Target list saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        await exec(`sh ${shellEscape(getModuleDir() + '/refresh_desc.sh')}`);
      } catch (e) {
        appendToOutput(`[TARGET] Failed to save target list: ${e}`, true);
      }
    } finally {
      applyBtn.disabled = false;
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  window.addEventListener('popstate', closeOverlay);

  setupPullToRefresh();
  await loadData();
}

export function wireTargetApps() {
  const btn = document.getElementById('target-apps-btn');
  if (!btn) return;
  btn.addEventListener('click', openTargetAppsManager);
}
