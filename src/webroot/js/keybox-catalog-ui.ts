import { exec, getModuleDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { API_URLS } from './constants.js';
import { escapeHtml, fetchJson, shellEscape, updateListContainerCorners } from './utils.js';
import { runAction } from './actions.js';
import { refreshKeyboxStatus } from './device.js';
import { createFilterDropdown, type FilterDropdownHandle, type FilterOption } from './filter-dropdown.js';
import type { CatalogEntry, CatalogJson } from './types.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export interface KeyboxCatalogOptions {
  refreshButton?: HTMLElement | null;
  onStateChange?: (canInstall: boolean) => void;
  onInstalled?: () => void;
}

export interface KeyboxCatalogHandle {
  load(): Promise<void>;
  install(): Promise<void>;
  canInstall(): boolean;
}

const AUTO_KEY = 'auto';

function entryKey(entry: CatalogEntry): string {
  return `${entry.source}|${entry.version}`;
}

function isActiveEntry(entry: CatalogEntry): boolean {
  if (entry.revoked || entry.softbanned) return false;
  if (!entry.rkp) return true;
  if (!entry.expires_at) return false;
  const expires = Date.parse(entry.expires_at);
  return Number.isFinite(expires) && expires > Date.now();
}

function entryLabel(entry: CatalogEntry): string {
  return `${entry.source} ${entry.text || entry.version}`;
}

function entryStatus(entry: CatalogEntry): string {
  if (entry.revoked) return t('custom_kb_revoked', 'Revoked');
  if (entry.softbanned) return t('custom_kb_softbanned', 'Softbanned');
  if (entry.rkp && !isActiveEntry(entry)) return t('custom_kb_expired', 'Expired');
  return t('custom_kb_active', 'Active');
}

function entryDescription(entry: CatalogEntry): string {
  const kind = entry.rkp ? 'RKP' : t('kb_catalog_normal', 'Normal');
  const expiry = entry.rkp && entry.expires_at
    ? `${t('kb_catalog_expires', 'Expires')} ${entry.expires_at.slice(0, 10)}`
    : '';
  return [entryStatus(entry), kind, expiry].filter(Boolean).join(' · ');
}

async function fetchCatalog(): Promise<CatalogJson | null> {
  const url = API_URLS.KEY_CATALOG!;
  const data = await fetchJson<CatalogJson>(url, 0).catch(() => null);
  if (data?.entries) return data;
  if (typeof exec !== 'function') return null;

  const commands = [
    `busybox wget -qO- --no-check-certificate ${shellEscape(url)} 2>/dev/null`,
    `curl -sfL --connect-timeout 10 ${shellEscape(url)} 2>/dev/null`,
  ];
  for (const command of commands) {
    try {
      const res = await exec(command);
      const stdout = (res.stdout || '').trim();
      if (!stdout) continue;
      const parsed = JSON.parse(stdout) as CatalogJson;
      if (parsed?.entries) return parsed;
    } catch {
      // Try the next downloader.
    }
  }
  return null;
}

export function mountKeyboxCatalog(container: HTMLElement, options: KeyboxCatalogOptions = {}): KeyboxCatalogHandle {
  const { refreshButton = null, onStateChange, onInstalled } = options;
  let filterValue = 'active';
  let entries: CatalogEntry[] = [];
  let selectedKey = AUTO_KEY;
  let selectedEntry: CatalogEntry | null = null;
  let catalogBody: HTMLElement | null = null;
  let filterDropdown: FilterDropdownHandle | null = null;
  let loading = false;
  let installing = false;

  const visibleEntries = () => entries.filter(entry => {
    if (filterValue === 'active') return isActiveEntry(entry);
    if (filterValue === 'all') return true;
    return entry.source === filterValue;
  });

  const activeInFilter = () => visibleEntries().filter(isActiveEntry);

  const canInstall = () =>
    !loading && !installing && (selectedEntry
      ? isActiveEntry(selectedEntry)
      : activeInFilter().length > 0);

  const updateFab = () => {
    onStateChange?.(canInstall());
  };

  const renderStatus = (icon: string, text: string, retry = false) => {
    if (!catalogBody) return;
    catalogBody.innerHTML = `
      <div class="kb-catalog-status">
        <md-icon aria-hidden="true">${icon}</md-icon>
        <p>${text}</p>
        ${retry ? `<md-text-button id="kb-catalog-retry">${t('kb_catalog_retry', 'Retry')}</md-text-button>` : ''}
      </div>
    `;
    if (retry) {
      catalogBody.querySelector('#kb-catalog-retry')?.addEventListener('click', () => {
        void loadCatalog();
      });
    }
  };

  const renderLoading = () => {
    if (!catalogBody) return;
    catalogBody.innerHTML = `
      <div class="kb-catalog-status">
        <md-circular-progress indeterminate></md-circular-progress>
        <p>${t('kb_catalog_loading', 'Loading keyboxes...')}</p>
      </div>
    `;
  };

  const updateRadios = () => {
    const list = catalogBody?.querySelector('#kb-catalog-list');
    list?.querySelectorAll('md-radio').forEach(radio => {
      (radio as HTMLElement & { checked: boolean }).checked =
        (radio as HTMLElement & { value: string }).value === selectedKey;
    });
  };

  const selectRow = (key: string) => {
    if (key === AUTO_KEY) {
      selectedKey = AUTO_KEY;
      selectedEntry = null;
    } else {
      const entry = entries.find(item => entryKey(item) === key);
      if (!entry) return;
      selectedKey = key;
      selectedEntry = entry;
    }
    updateRadios();
    updateFab();
  };

  const makeRadioRow = (
    key: string,
    title: string,
    description: string,
    icon: string,
    badge?: string,
    disabled = false,
  ): HTMLElement => {
    const row = document.createElement('div');
    row.className = `list-item list-item--radio${disabled ? ' kb-catalog-row--disabled' : ''}`;
    row.dataset.key = key;
    row.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    row.innerHTML = `
      <md-radio name="kb-catalog" value="${escapeHtml(key)}" aria-label="${escapeHtml(title)}${badge ? `, ${escapeHtml(badge)}` : ''}" ${disabled ? 'disabled' : ''}></md-radio>
      <div class="li-icon"><md-icon aria-hidden="true">${icon}</md-icon></div>
      <div class="list-item-content">
        <div class="toggle-text">${escapeHtml(title)}${badge ? ` <span class="subpage-radio-badge">${escapeHtml(badge)}</span>` : ''}</div>
        <span class="supporting-text">${escapeHtml(description)}</span>
      </div>
      <md-ripple></md-ripple>
    `;
    const radio = row.querySelector('md-radio') as HTMLElement & { checked: boolean };
    if (!disabled) {
      (radio as HTMLElement & { checked: boolean }).checked = key === selectedKey;
      row.addEventListener('click', (event) => {
        if (event.composedPath().some(node => node instanceof Element && node.localName === 'md-radio')) return;
        selectRow(key);
      });
      radio.addEventListener('change', () => {
        if (radio.checked) selectRow(key);
      });
    }
    return row;
  };

  const renderCatalog = () => {
    if (!catalogBody || !filterDropdown) return;

    const sources = [...new Set(entries.map(entry => entry.source))].sort();
    const filterOptions: FilterOption[] = [
      { value: 'active', label: t('custom_kb_active', 'Active') },
      { value: 'all', label: t('ta_filter_all', 'All') },
      ...sources.map(source => ({ value: source, label: source })),
    ];
    filterDropdown.setOptions(filterOptions);
    if (!filterOptions.some(option => option.value === filterValue)) {
      filterValue = 'active';
    }
    filterDropdown.setValue(filterValue);

    const visible = visibleEntries();
    const autoAvailable = visible.some(isActiveEntry);
    if (selectedEntry && !visible.some(entry => entryKey(entry) === selectedKey && isActiveEntry(entry))) {
      selectedKey = AUTO_KEY;
      selectedEntry = null;
    }

    catalogBody.innerHTML = '<div class="list-container" id="kb-catalog-list"></div>';
    const list = catalogBody.querySelector('#kb-catalog-list') as HTMLElement;

    if (autoAvailable) {
      const autoDescription = filterValue === 'active' || filterValue === 'all'
        ? t('kb_catalog_auto_desc', 'Let Specter pick an active keybox.')
        : `${t('kb_catalog_auto_desc', 'Let Specter pick an active keybox.')} (${filterValue})`;
      list.appendChild(makeRadioRow(
        AUTO_KEY,
        t('kb_catalog_auto', 'Automatic'),
        autoDescription,
        'autorenew',
        t('auto_target_recommended', 'Recommended'),
      ));
    }

    for (const entry of visible) {
      const active = isActiveEntry(entry);
      list.appendChild(makeRadioRow(
        entryKey(entry),
        entryLabel(entry),
        entryDescription(entry),
        'vpn_key',
        undefined,
        !active,
      ));
    }

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kb-catalog-status';
      empty.innerHTML = `
        <md-icon aria-hidden="true">info</md-icon>
        <p>${filterValue === 'active'
          ? t('kb_catalog_empty', 'No active keyboxes for this source.')
          : t('kb_catalog_empty_all', 'No keyboxes available.')}</p>
      `;
      catalogBody.appendChild(empty);
    }

    updateListContainerCorners(list);
  };

  let providerLoaded = false;

  async function loadCatalog() {
    if (loading) return;
    if (!providerLoaded) {
      const provider = (await cfgGet('keybox_provider', 'auto').catch(() => 'auto')) || 'auto';
      if (provider !== 'auto') filterValue = provider;
      providerLoaded = true;
    }
    loading = true;
    updateFab();
    refreshButton?.setAttribute('disabled', '');
    renderLoading();

    const data = await fetchCatalog();
    loading = false;
    refreshButton?.removeAttribute('disabled');

    if (!data?.entries) {
      entries = [];
      updateFab();
      renderStatus('error', t('kb_catalog_error', "Couldn't load the keybox catalog."), true);
      return;
    }

    entries = data.entries
      .sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '') ||
        a.source.localeCompare(b.source) ||
        a.version.localeCompare(b.version, undefined, { numeric: true }));
    const sources = [...new Set(entries.map(entry => entry.source))];
    if (filterValue !== 'active' && filterValue !== 'all' && !sources.includes(filterValue)) {
      filterValue = 'active';
    }
    if (selectedEntry && !entries.some(entry => entryKey(entry) === selectedKey && isActiveEntry(entry))) {
      selectedKey = AUTO_KEY;
      selectedEntry = null;
    }

    updateFab();
    if (entries.length === 0) {
      renderStatus('info', t('kb_catalog_empty_all', 'No keyboxes available.'), true);
      return;
    }
    renderCatalog();
  }

  async function installSelected() {
    if (installing || loading || entries.length === 0) return;
    const entry = selectedEntry;
    if (!entry && selectedKey !== AUTO_KEY) return;
    if (!entry && activeInFilter().length === 0) return;

    installing = true;
    updateFab();
    try {
      cfgSet('keybox_custom_type', '');
      cfgSet('keybox_custom_value', '');
      if (entry) {
        cfgSet('keybox_select_source', entry.source);
        cfgSet('keybox_select_version', entry.version);
        cfgSet('keybox_provider', entry.source);
      } else {
        cfgSet('keybox_select_source', '');
        cfgSet('keybox_select_version', '');
        cfgSet('keybox_provider', filterValue === 'active' || filterValue === 'all' ? 'auto' : filterValue);
      }

      const code = await runAction('keybox.sh');
      if (code === 0) {
        const moddir = getModuleDir();
        if (moddir) {
          await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
          await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
        }
        await refreshKeyboxStatus();
        onInstalled?.();
      }
    } finally {
      cfgSet('keybox_select_source', '');
      cfgSet('keybox_select_version', '');
      installing = false;
      updateFab();
    }
  }

  container.innerHTML = `
    <div class="kb-catalog-filters" id="kb-catalog-filters"></div>
    <div id="kb-catalog-body"></div>
  `;
  catalogBody = container.querySelector('#kb-catalog-body');
  const filterHost = container.querySelector('#kb-catalog-filters') as HTMLElement;
  filterDropdown = createFilterDropdown({
    id: 'kb-catalog-filter',
    ariaLabel: t('kb_filter_aria', 'Filter keyboxes'),
    value: filterValue,
    options: [
      { value: 'active', label: t('custom_kb_active', 'Active') },
      { value: 'all', label: t('ta_filter_all', 'All') },
    ],
    onChange: (next) => {
      filterValue = next;
      renderCatalog();
      updateFab();
    },
  });
  filterHost.appendChild(filterDropdown.element);

  refreshButton?.addEventListener('click', () => {
    void loadCatalog();
  });
  renderLoading();
  updateFab();

  return {
    load: loadCatalog,
    install: installSelected,
    canInstall,
  };
}
