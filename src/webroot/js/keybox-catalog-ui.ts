import { exec, getModuleDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { API_URLS } from './constants.js';
import { escapeHtml, fetchJson, shellEscape, updateListContainerCorners } from './utils.js';
import { runAction } from './actions.js';
import { refreshKeyboxStatus } from './device.js';
import { openSubPage } from './subpage.js';
import type { CatalogEntry, CatalogJson } from './types.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

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
  const kind = entry.rkp ? 'RKP' : t('kb_catalog_classic', 'Classic');
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

export async function openKeyboxCatalogPage() {
  const provider = (await cfgGet('keybox_provider', 'auto')) || 'auto';
  let sourceFilter = provider === 'auto' ? '' : provider;
  let entries: CatalogEntry[] = [];
  let selectedKey = AUTO_KEY;
  let selectedEntry: CatalogEntry | null = null;
  let catalogRoot: HTMLElement | null = null;
  let refreshBtn: HTMLElement | null = null;
  let installFab: HTMLElement | null = null;
  let loading = false;
  let installing = false;
  let activeOnly = true;
  let closePage: (() => void) | null = null;

  const activeInFilter = () =>
    entries.filter(entry => isActiveEntry(entry) && (!sourceFilter || entry.source === sourceFilter));

  const updateFab = () => {
    if (!installFab) return;
    const enabled = !loading && !installing && (selectedEntry
      ? isActiveEntry(selectedEntry)
      : activeInFilter().length > 0);
    installFab.toggleAttribute('disabled', !enabled);
  };

  const renderStatus = (icon: string, text: string, retry = false) => {
    if (!catalogRoot) return;
    catalogRoot.innerHTML = `
      <div class="kb-catalog-status">
        <md-icon aria-hidden="true">${icon}</md-icon>
        <p>${text}</p>
        ${retry ? `<md-text-button id="kb-catalog-retry">${t('kb_catalog_retry', 'Retry')}</md-text-button>` : ''}
      </div>
    `;
    if (retry) {
      catalogRoot.querySelector('#kb-catalog-retry')?.addEventListener('click', () => {
        void loadCatalog();
      });
    }
  };

  const renderLoading = () => {
    if (!catalogRoot) return;
    catalogRoot.innerHTML = `
      <div class="kb-catalog-status">
        <md-circular-progress indeterminate></md-circular-progress>
        <p>${t('kb_catalog_loading', 'Loading keyboxes...')}</p>
      </div>
    `;
  };

  const updateRadios = () => {
    const list = catalogRoot?.querySelector('#kb-catalog-list');
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
    if (!catalogRoot) return;
    const statusEntries = entries.filter(entry => !activeOnly || isActiveEntry(entry));
    const sources = [...new Set(statusEntries.map(entry => entry.source))].sort();
    if (sourceFilter && !sources.includes(sourceFilter)) sourceFilter = '';

    const visible = statusEntries.filter(entry => !sourceFilter || entry.source === sourceFilter);
    const autoAvailable = activeInFilter().length > 0;
    if (selectedEntry && !visible.some(entry => entryKey(entry) === selectedKey && isActiveEntry(entry))) {
      selectedKey = AUTO_KEY;
      selectedEntry = null;
    }

    catalogRoot.innerHTML = `
      <div class="kb-catalog-filters" id="kb-catalog-filters"></div>
      <div class="list-container" id="kb-catalog-list"></div>
    `;

    const filters = catalogRoot.querySelector('#kb-catalog-filters') as HTMLElement;
    const list = catalogRoot.querySelector('#kb-catalog-list') as HTMLElement;

    const activeChip = document.createElement('md-filter-chip') as HTMLElement & { label: string; selected: boolean };
    activeChip.label = t('custom_kb_active', 'Active');
    activeChip.selected = activeOnly;
    activeChip.addEventListener('click', () => {
      activeOnly = !activeOnly;
      if (selectedEntry && activeOnly && !isActiveEntry(selectedEntry)) {
        selectedKey = AUTO_KEY;
        selectedEntry = null;
      }
      renderCatalog();
      updateFab();
    });
    filters.appendChild(activeChip);

    const chips: (HTMLElement & { label: string; selected: boolean })[] = [];
    const makeChip = (label: string, source: string) => {
      const chip = document.createElement('md-filter-chip') as HTMLElement & { label: string; selected: boolean };
      chip.label = label;
      chip.dataset.source = source;
      chip.selected = sourceFilter === source;
      chip.addEventListener('click', () => {
        if (sourceFilter === source) return;
        sourceFilter = source;
        if (selectedEntry && sourceFilter && selectedEntry.source !== sourceFilter) {
          selectedKey = AUTO_KEY;
          selectedEntry = null;
        }
        renderCatalog();
        updateFab();
      });
      filters.appendChild(chip);
      chips.push(chip);
      return chip;
    };

    makeChip(`${t('ta_filter_all', 'All')} (${statusEntries.length})`, '');
    for (const source of sources) {
      const count = statusEntries.filter(entry => entry.source === source).length;
      makeChip(`${source} (${count})`, source);
    }
    for (const chip of chips) chip.selected = chip.dataset.source === sourceFilter;

    if (autoAvailable) {
      const autoDescription = t('kb_catalog_auto_desc', 'Let Specter pick an active keybox.');
      list.appendChild(makeRadioRow(
        AUTO_KEY,
        t('kb_catalog_auto', 'Automatic'),
        sourceFilter ? `${autoDescription} (${sourceFilter})` : autoDescription,
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
        <p>${activeOnly
          ? t('kb_catalog_empty', 'No active keyboxes for this source.')
          : t('kb_catalog_empty_all', 'No keyboxes available.')}</p>
      `;
      catalogRoot.appendChild(empty);
    }

    updateListContainerCorners(list);
  };

  async function loadCatalog() {
    if (loading) return;
    loading = true;
    updateFab();
    refreshBtn?.setAttribute('disabled', '');
    renderLoading();

    const data = await fetchCatalog();
    loading = false;
    refreshBtn?.removeAttribute('disabled');

    if (!data?.entries) {
      entries = [];
      updateFab();
      renderStatus('error', t('kb_catalog_error', "Couldn't load the keybox catalog."), true);
      return;
    }

    entries = data.entries
      .sort((a, b) =>
        a.source.localeCompare(b.source) ||
        a.version.localeCompare(b.version, undefined, { numeric: true }));
    const sources = [...new Set(entries.map(entry => entry.source))];
    if (sourceFilter && !sources.includes(sourceFilter)) sourceFilter = '';
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
        cfgSet('keybox_provider', sourceFilter || 'auto');
      }

      const code = await runAction('keybox.sh');
      if (code === 0) {
        const moddir = getModuleDir();
        if (moddir) {
          await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
          await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
        }
        await refreshKeyboxStatus();
        closePage?.();
      }
    } finally {
      cfgSet('keybox_select_source', '');
      cfgSet('keybox_select_version', '');
      installing = false;
      updateFab();
    }
  }

  const instance = await openSubPage({
    id: 'keybox-catalog',
    title: t('menu_import_keybox', 'Install Keybox'),
    description: t('menu_import_keybox_desc', 'Choose an active keybox from the catalog.'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-catalog-content',
            render: (container) => {
              catalogRoot = container;
              renderLoading();
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
      refreshBtn = container.querySelector('#kb-catalog-refresh');
      refreshBtn?.addEventListener('click', () => {
        void loadCatalog();
      });
    },
    fab: (container) => {
      container.innerHTML = `
        <md-fab variant="primary" class="subpage-fab" id="kb-catalog-install" label="${t('kb_catalog_install', 'Install')}" disabled>
          <md-icon slot="icon" aria-hidden="true">download</md-icon>
        </md-fab>
      `;
      installFab = container.querySelector('#kb-catalog-install');
      installFab?.addEventListener('click', () => {
        void installSelected();
      });
      updateFab();
    },
  });

  closePage = instance.close;
  await loadCatalog();
}

export function wireKeyboxCatalog() {
  const btn = document.getElementById('keybox-catalog-btn');
  if (!btn || btn.dataset.spWired) return;
  btn.dataset.spWired = '1';
  btn.addEventListener('click', () => {
    void openKeyboxCatalogPage();
  });
  btn.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void openKeyboxCatalogPage();
  });
}
