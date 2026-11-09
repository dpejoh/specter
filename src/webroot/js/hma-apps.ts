import { exec, spawnCommand, getModuleDir } from './bridge.js';
import { shellEscape } from './utils.js';
import { openAppRegenerateDialog } from './app-list-dialogs.js';
import {
  importDenylistAction,
  openAppListPage,
  refreshAction,
  selectAllAction,
  deselectAllAction,
  toggleModeAction,
  toggleSystemAction,
  type AppListPageAdapter,
} from './app-list-page.js';
import {
  parsePlainList,
  serializePlainSelection,
  translateLabel,
  type StateVisual,
} from './app-list-model.js';
import { specterDir, stageContent } from './app-list-io.js';
import type { AppListShellSpec } from './app-list-shell.js';

type ScopeState = 'unchecked' | 'targeted';
type BlacklistState = 'unchecked' | 'blacklisted';
export type AppState = ScopeState | BlacklistState;

export interface HmaApp {
  packageName: string;
  appName: string;
  state: AppState;
}

const SCOPE_VISUALS: Record<string, StateVisual> = {
  unchecked: {
    icon: '',
    text: '',
    labelKey: 'ha_state_unchecked',
    labelFallback: 'Not in HMA scope',
  },
  targeted: {
    icon: 'done',
    text: '',
    labelKey: 'ha_state_targeted',
    labelFallback: 'In HMA scope',
  },
};

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
  await stageContent(staging, content, 'HMA scope list');
  const committed = await spawnCommand(`sh ${hmaScript()} --set ${shellEscape(staging)}`);
  if (committed.code !== 0) throw new Error(committed.stderr || 'failed to commit HMA scope list');
  await spawnCommand(`rm -f ${shellEscape(staging)}`);
}

function hmaShellSpec(): AppListShellSpec {
  return {
    headerExtraClass: 'ha-header',
    titleExtraClass: 'ha-title',
    searchContainerExtraClass: 'ha-search-container',
    title: { id: 'ha-title', label: { key: 'ha_title', fallback: 'HMA-OSS Scope' } },
    back: { id: 'ha-back', label: { key: 'common_back', fallback: 'Back' } },
    search: {
      inputId: 'ha-search',
      clearId: 'ha-search-clear',
      buttonId: 'ha-search-btn',
      placeholder: { key: 'ta_search_placeholder', fallback: 'Search apps' },
      clearLabel: { key: 'ta_search_clear', fallback: 'Clear search' },
    },
    menu: {
      buttonId: 'ha-menu-btn',
      id: 'ha-menu',
      buttonLabel: { key: 'ta_menu_more', fallback: 'More options' },
      items: [
        { id: 'ha-refresh', label: { key: 'ta_refresh', fallback: 'Refresh' }, slotClass: 'first' as const },
        { id: 'ha-select-all', label: { key: 'ta_select_all', fallback: 'Select All' } },
        { id: 'ha-deselect-all', label: { key: 'ta_deselect_all', fallback: 'Deselect All' } },
        { id: 'ha-regenerate', label: { key: 'ha_regenerate', fallback: 'Regenerate' } },
        { id: 'ha-toggle-system', label: { key: 'ta_show_system', fallback: 'Show system apps' } },
        { id: 'ha-toggle-mode', label: { key: 'ta_edit_blacklist', fallback: 'Edit blacklist' } },
        { id: 'ha-import-denylist', label: { key: 'ta_import_denylist', fallback: 'Import from DenyList' }, slotClass: 'last' as const },
      ],
    },
    filtersId: 'ha-filters',
    listId: 'ha-list',
    loading: { id: 'ha-loading', label: { key: 'ta_loading', fallback: 'Loading apps...' } },
    apply: { id: 'ha-apply', label: { key: 'ta_apply', fallback: 'Apply' } },
    ptr: { indicatorId: 'ha-ptr-indicator', arrowId: 'ha-ptr-arrow' },
  };
}

function openHmaRegenerateDialog(refresh: () => Promise<void>, loading: HTMLElement, list: HTMLElement) {
  openAppRegenerateDialog({
    confirmId: 'ha-regenerate-confirm',
    title: translateLabel({ key: 'ha_regenerate', fallback: 'Regenerate' }),
    body: translateLabel({ key: 'ha_regenerate_confirm', fallback: 'This will re-scan all installed apps and rebuild HMA-OSS configuration. Custom selections will be overwritten. A backup will be saved.' }),
    confirmLabel: translateLabel({ key: 'ha_regenerate', fallback: 'Regenerate' }),
    cancelLabel: translateLabel({ key: 'dialog_cancel', fallback: 'Cancel' }),
    successLabel: translateLabel({ key: 'ha_regenerate_success', fallback: 'HMA-OSS configuration regenerated' }),
    loading,
    list,
    run: async () => {
      await exec(`sh ${hmaScript()}`);
    },
    refresh,
    logStart: '[HMA] Regenerating HMA-OSS config from all apps...',
    logDone: '[HMA] Regeneration complete',
    logFailed: '[HMA] Regeneration failed',
  });
}

export function createHmaAdapter(): AppListPageAdapter {
  return {
    overlay: {
      className: 'ta-overlay ha-overlay',
      guardSelector: '.ha-overlay',
      historyKey: 'hma-apps',
      primaryModeName: 'scope',
      idPrefix: 'ha',
    },
    primaryFilterId: 'ha-state-filter',
    shell: hmaShellSpec(),
    labels: {
      primaryTitle: { key: 'ha_title', fallback: 'HMA-OSS Scope' },
      blacklistTitle: { key: 'bl_title', fallback: 'Blacklist' },
      editBlacklist: { key: 'ta_edit_blacklist', fallback: 'Edit blacklist' },
      backToPrimary: { key: 'ha_edit_scope', fallback: 'Back to scope' },
      showSystem: { key: 'ta_show_system', fallback: 'Show system apps' },
      hideSystem: { key: 'ta_hide_system', fallback: 'Hide system apps' },
      filterAll: { key: 'ta_filter_all', fallback: 'All' },
      filterSelected: { key: 'ta_filter_selected', fallback: 'Selected' },
      filterNotSelected: { key: 'ta_filter_not_selected', fallback: 'Not Selected' },
      filterSelectedBlacklist: { key: 'bl_filter_blacklisted', fallback: 'Blacklisted' },
      filterNotSelectedBlacklist: { key: 'bl_filter_not_blacklisted', fallback: 'Not Blacklisted' },
      filterAria: { key: 'ta_filter_aria', fallback: 'Filter apps by selection' },
      apply: { key: 'ta_apply', fallback: 'Apply' },
      applying: { key: 'ta_applying', fallback: 'Applying…' },
      applied: { key: 'ta_applied', fallback: 'Applied' },
      loadError: { key: 'ta_load_error', fallback: 'Failed to load apps' },
      noResults: { key: 'ta_no_results', fallback: 'No apps match your filter' },
    },
    visuals: SCOPE_VISUALS,
    terms: {
      logPrefix: '[HMA]',
      overlayName: 'HMA-OSS Scope',
      primaryMode: 'scope',
      primaryScope: 'HMA scope',
      failedPrimarySave: 'Failed to save HMA scope list',
    },
    state: {
      defaultPrimaryState: () => 'targeted',
      rowNext: (app, ctx) => {
        if (ctx.mode === 'blacklist') {
          return app.state === 'unchecked' ? 'blacklisted' : 'unchecked';
        }
        return app.state === 'targeted' ? 'unchecked' : 'targeted';
      },
      circleNext: (app, ctx) => {
        if (ctx.mode === 'blacklist') {
          return app.state === 'unchecked' ? 'blacklisted' : 'unchecked';
        }
        return app.state === 'targeted' ? 'unchecked' : 'targeted';
      },
      selectAllState: ctx => ctx.mode === 'blacklist' ? 'blacklisted' : 'targeted',
      importState: ctx => ctx.mode === 'blacklist' ? 'blacklisted' : 'targeted',
    },
    source: {
      read: readScopeList,
      writeMain: writeScopeList,
      parse: raw => parsePlainList(raw),
      serializeMain: apps => serializePlainSelection(apps, 'targeted'),
      linePackage: line => line,
      mainListName: 'scope list',
      primarySavedLog: count => `Wrote HMA-OSS scope (${count} targets)`,
      primarySavedToast: { key: 'ha_prompt_saved', fallback: 'HMA-OSS scope saved' },
    },
    menuActions: {
      'ha-refresh': refreshAction,
      'ha-select-all': selectAllAction,
      'ha-deselect-all': deselectAllAction,
      'ha-regenerate': ctx => {
        ctx.closeMenu();
        openHmaRegenerateDialog(ctx.refresh, ctx.elements.loading, ctx.elements.list);
      },
      'ha-toggle-system': toggleSystemAction,
      'ha-toggle-mode': toggleModeAction,
      'ha-import-denylist': importDenylistAction,
    },
  };
}

export async function openHmaAppsManager(): Promise<void> {
  await openAppListPage(createHmaAdapter());
}
