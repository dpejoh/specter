import { exec } from './bridge.js';
import { cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { API_URLS } from './constants.js';
import { fetchJson, shellEscape } from './utils.js';
import { createFilterDropdown, type FilterDropdownHandle, type FilterOption } from './filter-dropdown.js';
import { openSubPage } from './subpage.js';
import { installKeybox } from './keybox-install.js';
import './ui/sp-skeleton.js';
import type { CatalogEntry, CatalogJson } from './types.js';


export interface KeyboxCatalogOptions {
  refreshButton?: HTMLElement | null;
  onStateChange?: (canInstall: boolean) => void;
  onInstallingChange?: (installing: boolean) => void;
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
    `busybox wget -qO- --no-check-certificate ${shellEscape(url)}`,
    `curl -sfL --connect-timeout 10 ${shellEscape(url)}`,
  ];
  const failures: string[] = [];
  for (const command of commands) {
    try {
      const res = await exec(command);
      const stdout = (res.stdout || '').trim();
      if (!stdout) {
        failures.push(`${command}: ${(res.stderr || '').trim() || `exit ${res.code}`}`);
        continue;
      }
      const parsed = JSON.parse(stdout) as CatalogJson;
      if (parsed?.entries) return parsed;
      failures.push(`${command}: response is not a keybox catalog`);
    } catch (err) {
      failures.push(`${command}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.warn('Keybox catalog download failed:', failures.join('\n'));
  return null;
}

export function mountKeyboxCatalog(container: HTMLElement, options: KeyboxCatalogOptions = {}): KeyboxCatalogHandle {
  const { refreshButton = null, onStateChange, onInstallingChange, onInstalled } = options;
  type StatusFilter = 'active' | 'softbanned' | 'revoked' | 'all';
  let statusFilter: StatusFilter = 'active';
  let providerFilter = 'all';
  let entries: CatalogEntry[] = [];
  let selectedKey = AUTO_KEY;
  let selectedEntry: CatalogEntry | null = null;
  let catalogBody: HTMLElement | null = null;
  let statusDropdown: FilterDropdownHandle | null = null;
  let providerDropdown: FilterDropdownHandle | null = null;
  let loading = false;
  let installing = false;
  let installedKey: string | null = null;

  // The installed state belongs on the entry's row, not on the install
  // button: read the keybox info snapshot and match source + version.
  const refreshInstalledKey = async () => {
    const info = await fetchJson<{ installed?: boolean; source?: string; source_version?: string }>('./json/keybox_info.json')
      .catch(() => null);
    installedKey = info?.installed && info.source
      ? `${info.source}|${info.source_version || ''}`
      : null;
  };

  const visibleEntries = () => entries.filter(entry => {
    if (statusFilter === 'active' && !isActiveEntry(entry)) return false;
    // Revoked wins over softbanned, matching entryStatus().
    if (statusFilter === 'softbanned' && (!entry.softbanned || entry.revoked)) return false;
    if (statusFilter === 'revoked' && !entry.revoked) return false;
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
    // Mirror the loaded list's structure — same section, same rows — so
    // the skeleton has the grouped shape (position corners, 2px gaps,
    // row height) instead of three detached blocks. The aria-hidden goes
    // on the section, never on the rows: updatePositions() treats
    // aria-hidden rows as filtered out and strips their corners/margins.
    const skeletonRow = `
      <sp-settings-row variant="custom" class="kb-catalog-row kb-skeleton-row">
        <div slot="leading" class="kb-skeleton-leading">
          <sp-skeleton variant="circular" style="--sp-skeleton-size: 20px"></sp-skeleton>
          <sp-skeleton variant="circular"></sp-skeleton>
        </div>
        <span slot="headline"><sp-skeleton variant="text" class="kb-skeleton-title"></sp-skeleton></span>
        <span slot="supporting"><sp-skeleton variant="text" class="kb-skeleton-desc"></sp-skeleton></span>
      </sp-settings-row>`;
    catalogBody.innerHTML = `
      <div class="kb-catalog-loading" role="status">
        <sp-settings-section aria-hidden="true">${skeletonRow.repeat(3)}</sp-settings-section>
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
    const row = document.createElement('sp-settings-row');
    row.className = `kb-catalog-row${disabled ? ' kb-catalog-row--disabled' : ''}`;
    row.dataset.key = key;
    row.setAttribute('variant', 'navigation');
    row.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    if (disabled) row.disabled = true;

    const radio = document.createElement('md-radio');
    radio.setAttribute('slot', 'leading');
    radio.setAttribute('name', 'kb-catalog');
    radio.setAttribute('value', key);
    radio.setAttribute('aria-label', `${title}${badge ? `, ${badge}` : ''}`);
    radio.disabled = disabled;
    radio.toggleAttribute('disabled', disabled);
    radio.checked = key === selectedKey;
    row.append(radio);

    const rowIcon = document.createElement('md-icon');
    rowIcon.setAttribute('slot', 'icon');
    rowIcon.setAttribute('aria-hidden', 'true');
    rowIcon.textContent = icon;
    row.append(rowIcon);

    const headline = document.createElement('span');
    headline.setAttribute('slot', 'headline');
    headline.textContent = title;
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'subpage-radio-badge';
      badgeEl.textContent = badge;
      headline.append(' ', badgeEl);
    }
    row.append(headline);

    const supporting = document.createElement('span');
    supporting.setAttribute('slot', 'supporting');
    supporting.textContent = description;
    row.append(supporting);

    if (!disabled) {
      row.addEventListener('sp-activate', () => selectRow(key));
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
      { value: 'softbanned', label: t('custom_kb_softbanned', 'Softbanned') },
      { value: 'revoked', label: t('custom_kb_revoked', 'Revoked') },
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

    catalogBody.innerHTML = '<sp-settings-section id="kb-catalog-list"></sp-settings-section>';
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
        entryKey(entry) === installedKey ? t('kb_installed_badge', 'Installed') : undefined,
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
    await refreshInstalledKey();
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
    onInstallingChange?.(true);
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

      const ok = await installKeybox({
        onInstalled,
        label: entry ? entryLabel(entry) : t('kb_catalog_auto', 'Automatic'),
      });
      if (ok) {
        await refreshInstalledKey();
        renderCatalog();
      }
    } finally {
      cfgSet('keybox_select_source', '');
      cfgSet('keybox_select_version', '');
      installing = false;
      updateFab();
      onInstallingChange?.(false);
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
      { value: 'softbanned', label: t('custom_kb_softbanned', 'Softbanned') },
      { value: 'revoked', label: t('custom_kb_revoked', 'Revoked') },
      { value: 'all', label: t('ta_filter_all', 'All') },
    ],
    onChange: (next) => {
      statusFilter = (['active', 'softbanned', 'revoked', 'all'] as const).includes(next as StatusFilter)
        ? next as StatusFilter
        : 'active';
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
  const installButtonContent = installButton?.innerHTML ?? '';
  let canInstallNow = false;
  let installingNow = false;
  // The button that started the install carries its loading state:
  // disabled, spinner, state label — the page itself never blocks.
  const renderInstallButton = () => {
    if (!installButton) return;
    installButton.disabled = installingNow || !canInstallNow;
    installButton.classList.toggle('kb-install-btn--busy', installingNow);
    installButton.innerHTML = installingNow
      ? `<md-icon slot="icon" aria-hidden="true">progress_activity</md-icon> ${t('kb_installing_btn', 'Installing…')}`
      : installButtonContent;
  };

  catalog = mountKeyboxCatalog(catalogContent, {
    refreshButton,
    onStateChange: (canInstall) => {
      canInstallNow = canInstall;
      renderInstallButton();
    },
    onInstallingChange: (installing) => {
      installingNow = installing;
      renderInstallButton();
    },
    onInstalled: () => instance.close(),
  });

  installButton?.addEventListener('click', () => {
    void catalog?.install();
  });

  void catalog.load();
}
