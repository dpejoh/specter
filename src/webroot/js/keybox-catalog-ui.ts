import { exec } from './bridge.js';
import { cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { API_URLS } from './constants.js';
import { escapeHtml, fetchJson, shellEscape, updateListContainerCorners } from './utils.js';
import { createFilterDropdown, type FilterDropdownHandle, type FilterOption } from './filter-dropdown.js';
import { openSubPage } from './subpage.js';
import { installKeybox } from './keybox-install.js';
import { rowContent, rowIcon } from './ui-row.js';
import type { CatalogEntry, CatalogJson } from './types.js';


export interface KeyboxCatalogOptions {
  refreshButton?: HTMLElement | null;
  onStateChange?: (canInstall: boolean) => void;
  onInstalled?: () => void;
}

export interface KeyboxCatalogHandle {
  load(): Promise<void>;
  install(): Promise<void>;
  canInstall(): boolean;
  dispose(): void;
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
  let statusFilter: 'active' | 'all' = 'active';
  let providerFilter = 'all';
  let entries: CatalogEntry[] = [];
  let selectedKey = AUTO_KEY;
  let selectedEntry: CatalogEntry | null = null;
  let catalogBody: HTMLElement | null = null;
  let statusDropdown: FilterDropdownHandle | null = null;
  let providerDropdown: FilterDropdownHandle | null = null;
  let loading = false;
  let installing = false;

  const visibleEntries = () => entries.filter(entry => {
    if (statusFilter === 'active' && !isActiveEntry(entry)) return false;
    if (providerFilter !== 'all' && entry.source !== providerFilter) return false;
    return true;
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
      ${rowIcon(icon)}
      ${rowContent({
        title,
        titleHtml: `${escapeHtml(title)}${badge ? ` <span class="subpage-radio-badge">${escapeHtml(badge)}</span>` : ''}`,
        description,
      })}
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
    if (!catalogBody || !statusDropdown || !providerDropdown) return;

    const sources = [...new Set(entries.map(entry => entry.source))].sort();
    const statusOptions: FilterOption[] = [
      { value: 'active', label: t('custom_kb_active', 'Active') },
      { value: 'all', label: t('ta_filter_all', 'All') },
    ];
    const providerOptions: FilterOption[] = [
      { value: 'all', label: t('kb_filter_provider_all', 'All providers') },
      ...sources.map(source => ({ value: source, label: source })),
    ];

    statusDropdown.setOptions(statusOptions);
    statusDropdown.setValue(statusFilter);
    providerDropdown.setOptions(providerOptions);
    if (!providerOptions.some(option => option.value === providerFilter)) {
      providerFilter = 'all';
    }
    providerDropdown.setValue(providerFilter);

    const visible = visibleEntries();
    const autoAvailable = visible.some(isActiveEntry);
    if (selectedEntry && !visible.some(entry => entryKey(entry) === selectedKey && isActiveEntry(entry))) {
      selectedKey = AUTO_KEY;
      selectedEntry = null;
    }

    catalogBody.innerHTML = '<div class="list-container" id="kb-catalog-list"></div>';
    const list = catalogBody.querySelector('#kb-catalog-list') as HTMLElement;

    if (autoAvailable) {
      const autoDescription = providerFilter === 'all'
        ? t('kb_catalog_auto_desc', 'Let Specter pick an active keybox.')
        : `${t('kb_catalog_auto_desc', 'Let Specter pick an active keybox.')} (${providerFilter})`;
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
        <p>${statusFilter === 'active'
          ? t('kb_catalog_empty', 'No active keyboxes for this provider.')
          : t('kb_catalog_empty_all', 'No keyboxes available.')}</p>
      `;
      catalogBody.appendChild(empty);
    }

    updateListContainerCorners(list);
  };

  async function loadCatalog() {
    if (loading) return;
    // providerFilter starts at "all"; the installed provider must not silently
    // hide other sources when the catalog opens.
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
      renderStatus('error', t('kb_catalog_error', "Couldn't load available keyboxes."), true);
      return;
    }

    entries = data.entries
      .sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '') ||
        a.source.localeCompare(b.source) ||
        a.version.localeCompare(b.version, undefined, { numeric: true }));
    const sources = [...new Set(entries.map(entry => entry.source))];
    if (providerFilter !== 'all' && !sources.includes(providerFilter)) {
      providerFilter = 'all';
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
        cfgSet('keybox_provider', providerFilter === 'all' ? 'auto' : providerFilter);
      }

      await installKeybox({ onInstalled });
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
  statusDropdown = createFilterDropdown({
    id: 'kb-status-filter',
    ariaLabel: t('kb_filter_status_aria', 'Filter by status'),
    value: statusFilter,
    options: [
      { value: 'active', label: t('custom_kb_active', 'Active') },
      { value: 'all', label: t('ta_filter_all', 'All') },
    ],
    onChange: (next) => {
      statusFilter = next === 'all' ? 'all' : 'active';
      renderCatalog();
      updateFab();
    },
  });
  providerDropdown = createFilterDropdown({
    id: 'kb-provider-filter',
    ariaLabel: t('kb_filter_provider_aria', 'Filter by provider'),
    value: providerFilter,
    options: [
      { value: 'all', label: t('kb_filter_provider_all', 'All providers') },
    ],
    onChange: (next) => {
      providerFilter = next;
      renderCatalog();
      updateFab();
    },
  });
  filterHost.append(statusDropdown.element, providerDropdown.element);

  refreshButton?.addEventListener('click', () => {
    void loadCatalog();
  });
  renderLoading();
  updateFab();

  return {
    load: loadCatalog,
    install: installSelected,
    canInstall,
    dispose: () => {
      statusDropdown?.dispose();
      providerDropdown?.dispose();
    },
  };
}

export async function openKeyboxCatalogPage() {
  let catalogContent: HTMLElement | null = null;
  let refreshButton: HTMLElement | null = null;
  let catalog: KeyboxCatalogHandle | null = null;

  const instance = await openSubPage({
    id: 'keybox-catalog',
    title: t('kb_specter_keyboxes', 'Specter keyboxes'),
    description: t('menu_import_keybox_desc', 'Browse available keyboxes and install one.'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-catalog-content',
            render: (container) => {
              container.innerHTML = `
                <div id="kb-catalog-mount"></div>
                <md-filled-button id="kb-catalog-install" class="kb-install-btn" disabled>
                  <md-icon slot="icon" aria-hidden="true">check</md-icon>
                  ${t('kb_catalog_install', 'Install')}
                </md-filled-button>
              `;
              catalogContent = container.querySelector('#kb-catalog-mount');
              container.parentElement?.classList.add('kb-page-container');
            },
          },
        ],
      },
    ],
    headerAction: (container) => {
      container.innerHTML = `
        <md-icon-button id="kb-catalog-refresh" aria-label="${t('kb_refresh_btn', 'Refresh')}">
          <md-icon aria-hidden="true">refresh</md-icon>
        </md-icon-button>
      `;
      refreshButton = container.querySelector('#kb-catalog-refresh');
    },
    onClose: () => {
      catalog?.dispose();
    },
  });

  if (!catalogContent) return;

  const installButton = instance.overlay.querySelector('#kb-catalog-install') as
    | (HTMLElement & { disabled: boolean })
    | null;

  catalog = mountKeyboxCatalog(catalogContent, {
    refreshButton,
    onStateChange: (canInstall) => {
      if (installButton) installButton.disabled = !canInstall;
    },
    onInstalled: () => instance.close(),
  });

  installButton?.addEventListener('click', () => {
    void catalog?.install();
  });

  void catalog.load();
}
