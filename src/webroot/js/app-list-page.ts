// Shared controller for the App Targeting and HMA-OSS Scope overlays.
// Page-specific vocabulary, script paths, dialogs, and KSM logic live in the
// adapters; this module owns the overlay lifecycle, history, search, filters,
// list rendering, selection, blacklist editing, and apply flow.
import { afterPaint, shellEscape } from './utils.js';
import { spawnCommand } from './bridge.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { appendToOutput } from './terminal.js';
import { AppIconManager } from './target-apps-icons.js';
import { setupOverlayA11y } from './overlay-a11y.js';
import { closeMenu, wireMenuTrigger } from './menu-utils.js';
import { createFilterDropdown, type FilterDropdownHandle, type FilterOption } from './filter-dropdown.js';
import {
  buildAppListShell,
  queryAppListShell,
  type AppListShellMenuItem,
  type AppListShellRefs,
  type AppListShellSpec,
} from './app-list-shell.js';
import { setupPullToRefresh } from './pull-to-refresh.js';
import {
  BLACKLIST_VISUALS,
  filterAndSortApps,
  pruneBlacklistedLines,
  translateLabel,
  type AppLabel,
  type AppListEntry,
  type AppMode,
  type StateVisual,
} from './app-list-model.js';
import {
  cacheAllPackageIcons,
  fetchSystemPackages,
  fetchUserPackages,
  readBlacklistFile,
  resolvePackageNames,
  shellExec,
  specterDir,
} from './app-list-io.js';
import './ui/sp-settings-row.js';
import './ui/sp-settings-section.js';
import './ui/sp-skeleton.js';

export interface AppListLabels {
  primaryTitle: AppLabel;
  blacklistTitle: AppLabel;
  editBlacklist: AppLabel;
  backToPrimary: AppLabel;
  showSystem: AppLabel;
  hideSystem: AppLabel;
  filterAll: AppLabel;
  filterSelected: AppLabel;
  filterNotSelected: AppLabel;
  filterSelectedBlacklist: AppLabel;
  filterNotSelectedBlacklist: AppLabel;
  filterAria: AppLabel;
  apply: AppLabel;
  applying: AppLabel;
  applied: AppLabel;
  loadError: AppLabel;
  noResults: AppLabel;
}

export interface AppListTerms {
  logPrefix: string;
  overlayName: string;
  primaryMode: string;
  primaryScope: string;
  failedPrimarySave: string;
}

export interface AppListPageContext {
  readonly overlay: HTMLElement;
  readonly elements: AppListShellRefs;
  readonly apps: AppListEntry[];
  readonly filteredApps: AppListEntry[];
  readonly mode: AppMode;
  defaultPrimaryState: string;
  supportsPerAppMode: boolean;
  ksmFormat: string;
  readonly selectionMap: Map<string, string>;
  readonly search: string;
  readonly selectionFilter: 'all' | 'selected' | 'not_selected';
  readonly modeFilter: string;
  readonly showSystemApps: boolean;
  readonly systemPackages: readonly string[];
  labels: AppListLabels;
  terms: AppListTerms;
  source: AppListSourceHooks;
  state: AppListStateHooks;
  setMode(mode: AppMode): void;
  resetFilters(): void;
  setShowSystemApps(value: boolean): void;
  setSystemPackages(value: readonly string[]): void;
  applyFilters(): void;
  refresh(): Promise<void>;
  closeMenu(): void;
  log(message: string, error?: boolean): void;
  t(label: AppLabel): string;
}

export interface AppListStateHooks {
  defaultPrimaryState(ctx: AppListPageContext): string;
  rowNext(app: AppListEntry, ctx: AppListPageContext): string;
  circleNext(app: AppListEntry, ctx: AppListPageContext): string;
  selectAllState(ctx: AppListPageContext): string;
  importState(ctx: AppListPageContext): string;
}

export interface AppListSourceHooks {
  read(): Promise<string>;
  writeMain(content: string): Promise<void>;
  parse(raw: string, ctx: AppListPageContext): Map<string, string>;
  serializeMain(apps: readonly AppListEntry[], ctx: AppListPageContext): string;
  linePackage(line: string): string;
  mainListName: string;
  primarySavedLog(count: number, ctx: AppListPageContext): string;
  primarySavedToast: AppLabel;
  afterPrimarySave?(ctx: AppListPageContext): void;
}

export interface AppListSecondaryFilter {
  id: string;
  ariaLabel: AppLabel;
  options(ctx: AppListPageContext): FilterOption[];
  visible(ctx: AppListPageContext): boolean;
}

export type AppListMenuAction = (ctx: AppListPageContext) => void | Promise<void>;

export interface AppListPageAdapter {
  overlay: {
    className: string;
    guardSelector: string;
    historyKey: string;
    primaryModeName: string;
    idPrefix: string;
  };
  primaryFilterId: string;
  shell: AppListShellSpec;
  labels: AppListLabels;
  visuals: Record<string, StateVisual>;
  terms: AppListTerms;
  state: AppListStateHooks;
  source: AppListSourceHooks;
  secondaryFilter?: AppListSecondaryFilter;
  menuActions: Record<string, AppListMenuAction>;
  prepareLoad?(ctx: AppListPageContext): Promise<void>;
  refreshConfig?(ctx: AppListPageContext): Promise<void>;
  onLoaded?(ctx: AppListPageContext): void;
}

export interface AppListPageHandle {
  readonly context: AppListPageContext;
  refresh(): Promise<void>;
  close(): void;
}

const BLACKLIST_SAVED: AppLabel = {
  key: 'toast_blacklist_saved',
  fallback: 'Blacklist saved',
};

async function writeBlacklist(packages: readonly string[]): Promise<void> {
  const content = packages.join('\n');
  const encoded = await spawnCommand(`printf '%s' ${shellEscape(content)} | base64 -w0`);
  if (encoded.code !== 0) throw new Error(encoded.stderr || 'failed to encode blacklist');
  const b64 = encoded.stdout || '';
  const written = await spawnCommand(`mkdir -p ${specterDir()} && printf '%s' "${b64}" | base64 -d > ${specterDir()}/blacklist.txt`);
  if (written.code !== 0) throw new Error(written.stderr || 'failed to write blacklist.txt');
  const enabled = await spawnCommand(`mkdir -p ${specterDir()} && touch ${specterDir()}/blacklist_enabled`);
  if (enabled.code !== 0) throw new Error(enabled.stderr || 'failed to enable blacklist');
}

export function refreshAction(ctx: AppListPageContext): void {
  ctx.closeMenu();
  void ctx.refresh();
}

export function selectAllAction(ctx: AppListPageContext): void {
  const on = ctx.state.selectAllState(ctx);
  for (const app of ctx.apps) {
    app.state = on;
    if (ctx.mode === 'blacklist') ctx.selectionMap.delete(app.packageName);
  }
  ctx.log('Selected all apps');
  ctx.applyFilters();
  ctx.closeMenu();
}

export function deselectAllAction(ctx: AppListPageContext): void {
  for (const app of ctx.apps) app.state = 'unchecked';
  ctx.log('Deselected all apps');
  ctx.applyFilters();
  ctx.closeMenu();
}

export function toggleModeAction(ctx: AppListPageContext): void {
  ctx.closeMenu();
  if (ctx.mode === 'primary') {
    history.pushState({ overlay: ctx.overlay.dataset.historyKey, mode: 'blacklist' }, '');
    void switchToBlacklistMode(ctx);
  } else {
    void switchToPrimaryMode(ctx);
    if (history.state?.mode === 'blacklist') history.back();
  }
}

export async function importDenylistAction(ctx: AppListPageContext): Promise<void> {
  const { stdout } = await shellExec('magisk --denylist ls 2>/dev/null | awk -F\'|\' \'{print $1}\' | grep -v "isolated" | sort -u || echo ""');
  const pkgs = stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (pkgs.length === 0) {
    showToast(ctx.t({ key: 'ta_prompt_denylist_failed', fallback: 'Failed to read DenyList' }), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
    ctx.log('DenyList: failed to read', true);
  } else {
    let count = 0;
    for (const app of ctx.apps) {
      if (pkgs.includes(app.packageName)) {
        app.state = ctx.state.importState(ctx);
        if (ctx.mode === 'blacklist') ctx.selectionMap.delete(app.packageName);
        count++;
      }
    }
    ctx.log(`Imported ${count} apps from DenyList`);
    ctx.applyFilters();
    showToast(ctx.t({ key: 'ta_prompt_denylist_imported', fallback: 'DenyList apps selected' }), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
  }
  ctx.closeMenu();
}

export async function toggleSystemAction(ctx: AppListPageContext): Promise<void> {
  const overlay = ctx.overlay;
  const prefix = overlay.dataset.idPrefix || '';
  const menuItem = overlay.querySelector(`#${prefix}-toggle-system`) as HTMLElement | null;
  const headline = menuItem?.querySelector('[slot="headline"]') ?? null;

  ctx.setShowSystemApps(!ctx.showSystemApps);
  ctx.log(`${ctx.showSystemApps ? 'Showing' : 'Hiding'} system apps`);

  if (ctx.showSystemApps) {
    let systemPackages: readonly string[] = ctx.systemPackages;
    if (systemPackages.length === 0) {
      systemPackages = await fetchSystemPackages();
      ctx.setSystemPackages(systemPackages);
    }
    const existingPkgs = new Set(ctx.apps.map(a => a.packageName));
    const labelMap = await resolvePackageNames(systemPackages);

    let blSet = new Set<string>();
    if (ctx.mode === 'blacklist') blSet = await readBlacklistFile();

    for (const pkg of systemPackages) {
      if (!existingPkgs.has(pkg)) {
        const state = ctx.mode === 'primary'
          ? (ctx.selectionMap.get(pkg) || 'unchecked')
          : (blSet.has(pkg) ? 'blacklisted' : 'unchecked');
        ctx.apps.push({ packageName: pkg, appName: labelMap.get(pkg) || pkg, state });
      }
    }
    ctx.apps.sort((a, b) => a.packageName.localeCompare(b.packageName));
    if (headline) headline.textContent = ctx.t(ctx.labels.hideSystem);
  } else if (headline) {
    headline.textContent = ctx.t(ctx.labels.showSystem);
  }
  ctx.applyFilters();
  ctx.closeMenu();
}

async function switchToBlacklistMode(ctx: AppListPageContext): Promise<void> {
  ctx.log('Loading blacklist...');
  const blPkgs = await readBlacklistFile();
  ctx.log(`Loaded ${blPkgs.size} blacklisted entries`);
  for (const app of ctx.apps) {
    app.state = blPkgs.has(app.packageName) ? 'blacklisted' : 'unchecked';
  }
  setMode(ctx, 'blacklist');
}

async function switchToPrimaryMode(ctx: AppListPageContext): Promise<void> {
  setMode(ctx, 'primary');
  ctx.log(`Reloading ${ctx.terms.primaryMode} states...`);
  try {
    const raw = await ctx.source.read();
    const currentBl = new Set<string>();
    for (const app of ctx.apps) {
      if (app.state === 'blacklisted') currentBl.add(app.packageName);
    }
    for (const pkg of await readBlacklistFile()) currentBl.add(pkg);

    const parsed = ctx.source.parse(raw, ctx);
    ctx.selectionMap.clear();
    for (const [pkg, state] of parsed) {
      if (!currentBl.has(pkg)) ctx.selectionMap.set(pkg, state);
    }
    for (const app of ctx.apps) {
      app.state = ctx.selectionMap.get(app.packageName) ?? 'unchecked';
    }
    ctx.applyFilters();
  } catch (e) {
    ctx.log(`Failed to reload ${ctx.terms.primaryMode} states: ${e}`, true);
  }
}

function setMode(ctx: AppListPageContext, next: AppMode): void {
  ctx.setMode(next);
  ctx.log(`Switched to ${next === 'blacklist' ? 'blacklist' : ctx.terms.primaryMode} mode`);
  ctx.elements.titleEl.textContent = ctx.t(next === 'blacklist' ? ctx.labels.blacklistTitle : ctx.labels.primaryTitle);

  const prefix = ctx.overlay.dataset.idPrefix || '';
  const modeHeadline = ctx.overlay.querySelector(`#${prefix}-toggle-mode [slot="headline"]`);
  if (modeHeadline) {
    modeHeadline.textContent = ctx.t(next === 'blacklist' ? ctx.labels.backToPrimary : ctx.labels.editBlacklist);
  }
  const systemHeadline = ctx.overlay.querySelector(`#${prefix}-toggle-system [slot="headline"]`);
  if (ctx.showSystemApps && systemHeadline) {
    systemHeadline.textContent = ctx.t(ctx.labels.hideSystem);
  }

  ctx.resetFilters();
  ctx.applyFilters();
}

export async function openAppListPage(adapter: AppListPageAdapter): Promise<AppListPageHandle | null> {
  if (document.querySelector(adapter.overlay.guardSelector)) return null;
  await import('./material-subpages.js');

  const overlay = document.createElement('div');
  overlay.className = adapter.overlay.className;
  overlay.dataset.historyKey = adapter.overlay.historyKey;
  overlay.dataset.idPrefix = adapter.overlay.idPrefix;
  overlay.innerHTML = buildAppListShell(adapter.shell);
  document.body.appendChild(overlay);

  const refs = queryAppListShell(overlay, adapter.shell);

  let apps: AppListEntry[] = [];
  let filteredApps: AppListEntry[] = [];
  let currentFilter: 'all' | 'selected' | 'not_selected' = 'all';
  let currentModeFilter = 'all';
  let currentSearch = '';
  let showSystemApps = false;
  let sysPkgs: string[] = [];
  let mode: AppMode = 'primary';
  let defaultPrimaryState = 'bare';
  let supportsPerAppMode = Boolean(adapter.secondaryFilter);
  let ksmFormat = '';
  let searchOpen = false;

  const selectionMap = new Map<string, string>();
  const iconMgr = new AppIconManager();

  let cleanupA11y = () => {};
  let cleanupPtr = () => {};
  let closed = false;

  const filterOptions = (): FilterOption[] => [
    { value: 'all', label: translateLabel(adapter.labels.filterAll) },
    {
      value: 'selected',
      label: translateLabel(mode === 'blacklist' ? adapter.labels.filterSelectedBlacklist : adapter.labels.filterSelected),
    },
    {
      value: 'not_selected',
      label: translateLabel(mode === 'blacklist' ? adapter.labels.filterNotSelectedBlacklist : adapter.labels.filterNotSelected),
    },
  ];

  let secondaryDropdown: FilterDropdownHandle | null = null;

  const ctx: AppListPageContext = {
    overlay,
    elements: refs,
    apps,
    get filteredApps() { return filteredApps; },
    get mode() { return mode; },
    get defaultPrimaryState() { return defaultPrimaryState; },
    set defaultPrimaryState(v: string) { defaultPrimaryState = v; },
    get supportsPerAppMode() { return supportsPerAppMode; },
    set supportsPerAppMode(v: boolean) { supportsPerAppMode = v; },
    get ksmFormat() { return ksmFormat; },
    set ksmFormat(v: string) { ksmFormat = v; },
    selectionMap,
    get search() { return currentSearch; },
    get selectionFilter() { return currentFilter; },
    get modeFilter() { return currentModeFilter; },
    get showSystemApps() { return showSystemApps; },
    get systemPackages() { return sysPkgs; },
    applyFilters: () => applyFilters(),
    refresh: () => refresh(),
    closeMenu: () => closeTapMenu(),
    log: (message, error) => {
      if (error) appendToOutput(`${adapter.terms.logPrefix} ${message}`, true);
      else appendToOutput(`${adapter.terms.logPrefix} ${message}`);
    },
    t: translateLabel,
    setMode: (next) => {
      mode = next;
    },
    setShowSystemApps: (value) => { showSystemApps = value; },
    setSystemPackages: (value) => { sysPkgs = [...value]; },
    resetFilters: () => {
      currentFilter = 'all';
      currentModeFilter = 'all';
      filterDropdown.setOptions(filterOptions());
      filterDropdown.setValue('all');
      secondaryDropdown?.setValue('all');
      syncSecondaryVisibility();
    },
    labels: adapter.labels,
    terms: adapter.terms,
    source: adapter.source,
    state: adapter.state,
  };

  defaultPrimaryState = adapter.state.defaultPrimaryState(ctx);

  const filterDropdown = createFilterDropdown({
    id: adapter.primaryFilterId,
    ariaLabel: translateLabel(adapter.labels.filterAria),
    value: currentFilter,
    options: filterOptions(),
    onChange: (value) => {
      currentFilter = value as typeof currentFilter;
      if (currentFilter === 'not_selected' && secondaryDropdown && secondaryDropdown.getValue() !== 'all') {
        currentModeFilter = 'all';
        secondaryDropdown.setValue('all');
      }
      applyFilters();
    },
  });
  refs.filtersEl.appendChild(filterDropdown.element);

  if (adapter.secondaryFilter) {
    const secondary = adapter.secondaryFilter;
    secondaryDropdown = createFilterDropdown({
      id: secondary.id,
      ariaLabel: translateLabel(secondary.ariaLabel),
      value: currentModeFilter,
      options: secondary.options(ctx),
      onChange: (value) => {
        currentModeFilter = value;
        if (currentModeFilter !== 'all' && currentFilter === 'not_selected') {
          currentFilter = 'all';
          filterDropdown.setValue('all');
        }
        applyFilters();
      },
    });
    refs.filtersEl.appendChild(secondaryDropdown.element);
  }

  function syncSecondaryVisibility(): void {
    if (!secondaryDropdown || !adapter.secondaryFilter) return;
    secondaryDropdown.element.hidden = !adapter.secondaryFilter.visible(ctx);
  }
  syncSecondaryVisibility();
  refs.list.addEventListener('scroll', maybeAppendMore, { passive: true });

  function closeTapMenu(): void {
    closeMenu(refs.menu);
  }

  function closeOverlay(): void {
    if (closed) return;
    closed = true;
    cleanupA11y();
    cleanupPtr();
    filterDropdown.dispose();
    secondaryDropdown?.dispose();
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

  function onPopState(e: PopStateEvent): void {
    if (searchOpen) {
      exitSearch();
    } else if (mode === 'blacklist' && (!e.state || e.state.mode !== 'blacklist')) {
      void switchToPrimaryMode(ctx);
    } else if (e.state && (e.state.overlay === adapter.overlay.historyKey || e.state.subpage)) {
      return;
    } else {
      closeOverlay();
    }
  }

  requestAnimationFrame(() => overlay.classList.add('ta-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ overlay: adapter.overlay.historyKey }, '');
  appendToOutput(`${adapter.terms.logPrefix} Opened ${adapter.terms.overlayName} overlay`);

  cleanupA11y = setupOverlayA11y(overlay, {
    titleId: adapter.shell.title.id,
    onClose: closeOverlay,
    initialFocus: refs.backBtn,
  });

  function goBack(): void {
    if (closed) return;
    if (mode === 'blacklist') {
      void switchToPrimaryMode(ctx);
      if (history.state?.mode === 'blacklist') history.back();
    } else {
      history.back();
    }
  }

  refs.backBtn.addEventListener('click', goBack);

  wireMenuTrigger(refs.menuBtn, refs.menu);
  for (const item of adapter.shell.menu.items as readonly AppListShellMenuItem[]) {
    const el = overlay.querySelector(`#${item.id}`);
    if (!el) continue;
    el.addEventListener('click', () => {
      const action = adapter.menuActions[item.id];
      if (action) void action(ctx);
    });
  }

  refs.searchInput.addEventListener('input', () => {
    currentSearch = (refs.searchInput.value || '').trim();
    syncSearchClear();
    applyFilters();
  });

  function syncSearchClear(): void {
    refs.searchClearBtn.style.display = refs.searchInput.value ? '' : 'none';
  }

  function openSearch(): void {
    if (searchOpen) return;
    searchOpen = true;
    history.pushState({
      overlay: adapter.overlay.historyKey,
      mode: mode === 'blacklist' ? 'blacklist' : adapter.overlay.primaryModeName,
      search: true,
    }, '');
    refs.header.classList.add('ta-header--searching');
    refs.searchContainer.hidden = false;
    refs.searchBtn.setAttribute('aria-expanded', 'true');
    refs.searchInput.focus();
  }

  function exitSearch(): void {
    if (!searchOpen) return;
    searchOpen = false;
    refs.header.classList.remove('ta-header--searching');
    refs.searchContainer.hidden = true;
    refs.searchBtn.setAttribute('aria-expanded', 'false');
    if (currentSearch) {
      refs.searchInput.value = '';
      currentSearch = '';
      syncSearchClear();
      applyFilters();
    }
  }

  refs.searchBtn.addEventListener('click', openSearch);
  refs.searchClearBtn.addEventListener('click', () => {
    refs.searchInput.value = '';
    currentSearch = '';
    syncSearchClear();
    applyFilters();
    refs.searchInput.focus();
  });
  refs.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      e.stopPropagation();
      history.back();
    }
  });

  const CHUNK_SIZE = 48;
  let renderedCount = 0;
  let listSection: HTMLElement | null = null;
  let sentinelEl: HTMLElement | null = null;
  let chunkObserver: IntersectionObserver | null = null;

  function renderList(): void {
    chunkObserver?.disconnect();
    chunkObserver = null;
    sentinelEl = null;
    refs.list.innerHTML = '';
    renderedCount = 0;
    listSection = document.createElement('sp-settings-section');
    refs.list.appendChild(listSection);
    appendChunk();

    if (filteredApps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty';
      empty.textContent = translateLabel(adapter.labels.noResults);
      refs.list.appendChild(empty);
    }
  }

  function appendChunk(): void {
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

  function syncSentinel(): void {
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
      refs.list.appendChild(sentinelEl);
    }
    if (typeof IntersectionObserver === 'function') {
      if (!chunkObserver) {
        chunkObserver = new IntersectionObserver((entries) => {
          if (entries.some(entry => entry.isIntersecting)) appendChunk();
        }, { root: refs.list, rootMargin: '600px' });
      }
      chunkObserver.observe(sentinelEl);
    }
  }

  function maybeAppendMore(): void {
    if (!sentinelEl || renderedCount >= filteredApps.length) return;
    const rect = sentinelEl.getBoundingClientRect();
    if (rect.top < refs.list.getBoundingClientRect().bottom + 600) appendChunk();
  }

  function visualFor(state: string): StateVisual {
    const visuals = mode === 'blacklist' ? BLACKLIST_VISUALS : adapter.visuals;
    return visuals[state] ?? visuals.unchecked!;
  }

  function buildRow(app: AppListEntry): HTMLElement {
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

    const initialVisual = visualFor(app.state);
    item.setAttribute('aria-label', `${app.appName}, ${translateLabel({
      key: initialVisual.labelKey,
      fallback: initialVisual.text || app.state,
    })}`);
    circle.innerHTML = initialVisual.icon
      ? `<md-icon class="ta-state-icon">${initialVisual.icon}</md-icon>`
      : initialVisual.text
        ? `<span class="ta-state-icon ta-state-text">${initialVisual.text}</span>`
        : '';

    function applyAppState(newState: string): void {
      app.state = newState;
      if (mode === 'blacklist' && newState === 'blacklisted') {
        selectionMap.delete(app.packageName);
      }
      circle.setAttribute('data-state', newState);
      const visual = visualFor(newState);
      item.setAttribute('aria-label', `${app.appName}, ${translateLabel({
        key: visual.labelKey,
        fallback: visual.text || newState,
      })}`);
      const iconEl = circle.querySelector('.ta-state-icon');
      if (iconEl) {
        if (visual.icon) {
          iconEl.outerHTML = `<md-icon class="ta-state-icon">${visual.icon}</md-icon>`;
        } else if (visual.text) {
          iconEl.outerHTML = `<span class="ta-state-icon ta-state-text">${visual.text}</span>`;
        } else {
          iconEl.remove();
        }
      } else if (visual.icon) {
        circle.insertAdjacentHTML('beforeend', `<md-icon class="ta-state-icon">${visual.icon}</md-icon>`);
      } else if (visual.text) {
        circle.insertAdjacentHTML('beforeend', `<span class="ta-state-icon ta-state-text">${visual.text}</span>`);
      }
      item.dataset.state = newState;
      circle.classList.remove('ta-state-circle--anim');
      void circle.offsetWidth;
      circle.classList.add('ta-state-circle--anim');
    }

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = adapter.state.circleNext(app, ctx);
      if (next !== app.state) applyAppState(next);
    });

    item.addEventListener('click', () => {
      const next = adapter.state.rowNext(app, ctx);
      if (next !== app.state) applyAppState(next);
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

  function applyFilters(): void {
    filteredApps = filterAndSortApps(apps, {
      search: currentSearch,
      selection: currentFilter,
      mode,
      showSystemApps,
      systemPackages: sysPkgs,
      modeFilter: secondaryDropdown && adapter.secondaryFilter?.visible(ctx) && currentModeFilter !== 'all'
        ? currentModeFilter
        : null,
    });
    renderList();
  }

  async function replaceApps(pkgs: readonly string[]): Promise<void> {
    const have = new Set(pkgs);
    const extra = [...selectionMap.keys()].filter(p => !have.has(p));
    const all = [...pkgs, ...extra];
    const labelMap = await resolvePackageNames(all);
    apps.length = 0;
    for (const pkg of all) {
      apps.push({
        packageName: pkg,
        appName: labelMap.get(pkg) || pkg,
        state: selectionMap.get(pkg) || 'unchecked',
      });
    }
  }

  async function loadData(): Promise<void> {
    try {
      await cacheAllPackageIcons(48);
      const [raw, pkgs] = await Promise.all([
        adapter.source.read(),
        fetchUserPackages(),
        adapter.prepareLoad?.(ctx),
      ]);
      syncSecondaryVisibility();

      const parsed = adapter.source.parse(raw, ctx);
      selectionMap.clear();
      for (const [pkg, state] of parsed) selectionMap.set(pkg, state);

      await replaceApps(pkgs);
      adapter.onLoaded?.(ctx);
      ctx.log(`Loaded ${apps.length} user apps, ${selectionMap.size} in ${adapter.terms.primaryScope}`);
      refs.loading.style.display = 'none';
      refs.list.style.display = '';
      applyFilters();
    } catch (e) {
      ctx.log(`Failed to load app data: ${e}`, true);
      refs.loading.innerHTML = `<p class="ta-loading-error">${translateLabel(adapter.labels.loadError)}</p>`;
    }
  }

  async function refresh(): Promise<void> {
    try {
      const [raw, pkgs] = await Promise.all([
        adapter.source.read(),
        fetchUserPackages(),
        adapter.refreshConfig?.(ctx),
      ]);
      syncSecondaryVisibility();
      const parsed = adapter.source.parse(raw, ctx);
      selectionMap.clear();
      for (const [pkg, state] of parsed) selectionMap.set(pkg, state);

      await replaceApps(pkgs);
      ctx.log(`Refreshed ${apps.length} user apps, ${selectionMap.size} in ${adapter.terms.primaryScope}`);
      applyFilters();
    } catch (e) {
      ctx.log(`Refresh failed: ${e}`, true);
    }
  }

  refs.applyBtn.addEventListener('click', async () => {
    const applyBtn = refs.applyBtn;
    if (applyBtn.disabled) return;
    applyBtn.disabled = true;

    const originalLabel = translateLabel(adapter.labels.apply);
    const applyingLabel = translateLabel(adapter.labels.applying);
    applyBtn.label = applyingLabel;
    applyBtn.setAttribute('label', applyingLabel);

    const loadingToast = showLoadingToast(applyingLabel);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    function markApplied(): void {
      applyBtn.label = translateLabel(adapter.labels.applied);
      applyBtn.setAttribute('label', translateLabel(adapter.labels.applied));
      setTimeout(() => {
        applyBtn.label = originalLabel;
        applyBtn.setAttribute('label', originalLabel);
        applyBtn.disabled = false;
      }, 1500);
    }

    function markFailed(e: unknown, logMessage: string): void {
      ctx.log(`${logMessage}: ${e}`, true);
      updateToast(loadingToast, `${translateLabel({ key: 'simple_toast_error', fallback: 'Failed' })}: ${e}`, { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      applyBtn.label = originalLabel;
      applyBtn.setAttribute('label', originalLabel);
      applyBtn.disabled = false;
    }

    if (mode === 'blacklist') {
      const bl = apps.filter(a => a.state === 'blacklisted').map(a => a.packageName).sort();
      const blSet = new Set(bl);
      for (const pkg of blSet) selectionMap.delete(pkg);

      try {
        await writeBlacklist(bl);
        ctx.log(`Wrote ${bl.length} entries to blacklist.txt`);

        try {
          const raw = await adapter.source.read();
          const pruned = pruneBlacklistedLines(raw, blSet, adapter.source.linePackage);
          if (pruned.removed > 0) {
            await adapter.source.writeMain(pruned.content);
            ctx.log(`Pruned ${pruned.removed} blacklisted entries from ${adapter.source.mainListName}`);
          }
        } catch (te) {
          ctx.log(`Warning: could not prune ${adapter.source.mainListName}: ${te}`, true);
        }

        updateToast(loadingToast, translateLabel(BLACKLIST_SAVED), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        markApplied();
      } catch (e) {
        markFailed(e, 'Failed to save blacklist');
      }
      return;
    }

    const content = adapter.source.serializeMain(apps, ctx);
    const count = content ? content.split('\n').length : 0;
    try {
      await adapter.source.writeMain(content);
      ctx.log(adapter.source.primarySavedLog(count, ctx));
      updateToast(loadingToast, translateLabel(adapter.source.primarySavedToast), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      markApplied();
      adapter.source.afterPrimarySave?.(ctx);
    } catch (e) {
      markFailed(e, adapter.terms.failedPrimarySave);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (history.state && history.state.overlay === adapter.overlay.historyKey) history.back();
    else closeOverlay();
  });

  window.addEventListener('popstate', onPopState);

  cleanupPtr = setupPullToRefresh({
    scroller: refs.list,
    indicator: refs.ptrIndicator,
    arrow: refs.ptrArrow,
    onRefresh: refresh,
  });

  await new Promise<void>(resolve => afterPaint(resolve, 300));
  await loadData();

  return { context: ctx, refresh, close: closeOverlay };
}
