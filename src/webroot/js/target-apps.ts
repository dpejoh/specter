import { exec, spawnCommand, getModuleDir } from './bridge.js';
import { cfgGet } from './cfg.js';
import { shellEscape, fetchJson } from './utils.js';
import { API_URLS } from './constants.js';
import type { KeystoreManagerJson } from './types.js';
import { openTeesimModeDialog, openModeSubpage, openRegenerateDialog } from './target-apps-dialogs.js';
import type { TargetDialogsContext } from './target-apps-dialogs.js';
import {
  importDenylistAction,
  openAppListPage,
  refreshAction,
  selectAllAction,
  deselectAllAction,
  toggleModeAction,
  toggleSystemAction,
  type AppListPageAdapter,
  type AppListPageContext,
} from './app-list-page.js';
import {
  nextCyclic,
  parseSuffixedList,
  serializeSuffixedSelection,
  type AppListEntry,
  type StateVisual,
  type TargetAppState,
  type TargetState,
} from './app-list-model.js';
import { specterDir, stageContent } from './app-list-io.js';
import type { AppListShellSpec } from './app-list-shell.js';

export type { TargetState };
export type KsmFormat = 'txt' | 'ini' | 'toml' | 'json' | '';
export type AppState = TargetAppState;
export type TargetApp = AppListEntry<TargetAppState>;

const TARGET_VISUALS: Record<string, StateVisual> = {
  unchecked: {
    icon: '',
    text: '',
    labelKey: 'ta_state_unchecked',
    labelFallback: 'Not in target list',
  },
  bare: {
    icon: 'done',
    text: '',
    labelKey: 'ta_state_bare',
    labelFallback: 'In target list',
  },
  conditional: {
    icon: '',
    text: '?',
    labelKey: 'ta_state_conditional',
    labelFallback: 'Conditional (?)',
  },
  force: {
    icon: '',
    text: '!',
    labelKey: 'ta_state_force',
    labelFallback: 'Force (!)',
  },
};

// target.txt (Tricky Store) / injector.toml (OhMyKeymint) — both via target.sh.
function targetScript(): string {
  const moddir = getModuleDir();
  if (!moddir) throw new Error('module dir unavailable');
  return shellEscape(moddir + '/features/target.sh');
}

async function readTargetList(): Promise<string> {
  const { stdout, code, stderr } = await spawnCommand(`sh ${targetScript()} --list-raw`);
  if (code !== 0) throw new Error(stderr || 'failed to read target list');
  return stdout || '';
}

async function writeTargetList(content: string): Promise<void> {
  const staging = `${specterDir()}/.target_staging`;
  await stageContent(staging, content, 'target list');
  const committed = await spawnCommand(`sh ${targetScript()} --set ${shellEscape(staging)}`);
  if (committed.code !== 0) throw new Error(committed.stderr || 'failed to commit target list');
  await spawnCommand(`rm -f ${shellEscape(staging)}`);
}

function targetShellSpec(): AppListShellSpec {
  return {
    title: { id: 'ta-title', label: { key: 'ta_title', fallback: 'App Targeting' } },
    back: { id: 'ta-back', label: { key: 'common_back', fallback: 'Back' } },
    search: {
      inputId: 'ta-search',
      clearId: 'ta-search-clear',
      buttonId: 'ta-search-btn',
      placeholder: { key: 'ta_search_placeholder', fallback: 'Search apps' },
      clearLabel: { key: 'ta_search_clear', fallback: 'Clear search' },
    },
    menu: {
      buttonId: 'ta-menu-btn',
      id: 'ta-menu',
      buttonLabel: { key: 'ta_menu_more', fallback: 'More options' },
      items: [
        { id: 'ta-refresh', label: { key: 'ta_refresh', fallback: 'Refresh' }, slotClass: 'first' },
        { id: 'ta-select-all', label: { key: 'ta_select_all', fallback: 'Select All' } },
        { id: 'ta-deselect-all', label: { key: 'ta_deselect_all', fallback: 'Deselect All' } },
        { id: 'ta-mode', label: { key: 'ta_mode_menu', fallback: 'Default Mode' } },
        { id: 'ta-regenerate', label: { key: 'ta_regenerate', fallback: 'Regenerate' } },
        { id: 'ta-toggle-system', label: { key: 'ta_show_system', fallback: 'Show system apps' } },
        { id: 'ta-toggle-mode', label: { key: 'ta_edit_blacklist', fallback: 'Edit blacklist' } },
        { id: 'ta-import-denylist', label: { key: 'ta_import_denylist', fallback: 'Import from DenyList' }, slotClass: 'last' },
      ],
    },
    filtersId: 'ta-filters',
    listId: 'ta-list',
    loading: { id: 'ta-loading', label: { key: 'ta_loading', fallback: 'Loading apps...' } },
    apply: { id: 'ta-apply', label: { key: 'ta_apply', fallback: 'Apply' } },
    ptr: { indicatorId: 'ptr-indicator', arrowId: 'ptr-arrow' },
  };
}

function dialogsContext(ctx: AppListPageContext): TargetDialogsContext {
  return {
    apps: ctx.apps,
    getDefaultMode: () => ctx.defaultPrimaryState,
    setDefaultMode: (m: string) => { ctx.defaultPrimaryState = m; },
    applyFilters: () => ctx.applyFilters(),
    refreshApps: () => ctx.refresh(),
    loading: ctx.elements.loading,
    list: ctx.elements.list,
  };
}

export function createTargetAdapter(): AppListPageAdapter {
  return {
    overlay: {
      className: 'ta-overlay',
      guardSelector: '.ta-overlay',
      historyKey: 'target-apps',
      primaryModeName: 'target',
      idPrefix: 'ta',
    },
    primaryFilterId: 'ta-state-filter',
    shell: targetShellSpec(),
    labels: {
      primaryTitle: { key: 'ta_title', fallback: 'App Targeting' },
      blacklistTitle: { key: 'bl_title', fallback: 'Blacklist' },
      editBlacklist: { key: 'ta_edit_blacklist', fallback: 'Edit blacklist' },
      backToPrimary: { key: 'ta_edit_target', fallback: 'Back to targeting' },
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
    visuals: TARGET_VISUALS,
    terms: {
      logPrefix: '[TARGET]',
      overlayName: 'App Targeting',
      primaryMode: 'target',
      primaryScope: 'target list',
      failedPrimarySave: 'Failed to save target list',
    },
    state: {
      defaultPrimaryState: ctx => ctx.supportsPerAppMode ? ctx.defaultPrimaryState : 'bare',
      rowNext: (app, ctx) => {
        if (ctx.mode === 'blacklist') {
          return app.state === 'unchecked' ? 'blacklisted' : 'unchecked';
        }
        if (app.state === 'unchecked') {
          return ctx.supportsPerAppMode ? ctx.defaultPrimaryState : 'bare';
        }
        return 'unchecked';
      },
      circleNext: (app, ctx) => {
        if (ctx.mode === 'blacklist') {
          return app.state === 'unchecked' ? 'blacklisted' : 'unchecked';
        }
        if (app.state === 'unchecked') return 'bare';
        if (!ctx.supportsPerAppMode) return 'unchecked';
        return nextCyclic(['bare', 'conditional', 'force'], app.state) ?? 'bare';
      },
      selectAllState: ctx => {
        if (ctx.mode === 'blacklist') return 'blacklisted';
        return ctx.supportsPerAppMode ? ctx.defaultPrimaryState : 'bare';
      },
      importState: ctx => ctx.mode === 'blacklist' ? 'blacklisted' : 'bare',
    },
    source: {
      read: readTargetList,
      writeMain: writeTargetList,
      parse: (raw, ctx) => parseSuffixedList(raw, ctx.supportsPerAppMode),
      serializeMain: (apps, ctx) => serializeSuffixedSelection(apps, ctx.supportsPerAppMode),
      linePackage: line => line.replace(/[!?]$/, ''),
      mainListName: 'target list',
      primarySavedLog: count => `Wrote target list (${count} selected + FIXED_TARGETS)`,
      primarySavedToast: { key: 'ta_prompt_saved', fallback: 'Target list saved' },
      afterPrimarySave: () => {
        const moddir = getModuleDir();
        if (!moddir) return;
        // Refresh module description in the background without blocking the WebUI
        setTimeout(() => {
          spawnCommand(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
        }, 500);
      },
    },
    secondaryFilter: {
      id: 'ta-mode-filter',
      ariaLabel: { key: 'ta_filter_mode_aria', fallback: 'Filter apps by mode' },
      options: ctx => [
        { value: 'all', label: ctx.t({ key: 'ta_filter_all_modes', fallback: 'All Modes' }) },
        { value: 'bare', label: ctx.t({ key: 'ta_mode_bare', fallback: 'Auto' }) },
        { value: 'conditional', label: `? ${ctx.t({ key: 'ta_mode_conditional', fallback: 'Leaf' })}` },
        { value: 'force', label: `! ${ctx.t({ key: 'ta_mode_force', fallback: 'Gen' })}` },
      ],
      visible: ctx => ctx.mode === 'primary' && ctx.supportsPerAppMode,
    },
    prepareLoad: async ctx => {
      // Fetch Keystore config and default mode concurrently with the list.
      const [km, defaultModeVal] = await Promise.all([
        fetchJson<KeystoreManagerJson>(API_URLS.KEYSTORE_MANAGER!, 0).catch(() => null),
        cfgGet('target_default_mode', 'bare').catch(() => 'bare'),
      ]);

      const fmt = km?.format || '';
      ctx.ksmFormat = fmt === 'json' || fmt === 'toml' || fmt === 'txt' || fmt === 'ini' ? fmt : 'txt';
      const perAppModes = km?.perAppModes;
      ctx.supportsPerAppMode = perAppModes ?? (ctx.ksmFormat === 'txt' || ctx.ksmFormat === 'ini');
      ctx.defaultPrimaryState = ctx.supportsPerAppMode ? (defaultModeVal || 'bare') : 'bare';
    },
    refreshConfig: async ctx => {
      const defaultModeVal = await cfgGet('target_default_mode', 'bare').catch(() => 'bare');
      ctx.defaultPrimaryState = ctx.supportsPerAppMode ? (defaultModeVal || 'bare') : 'bare';
    },
    onLoaded: ctx => {
      const modeItem = ctx.overlay.querySelector('#ta-mode') as HTMLElement | null;
      if (!modeItem) return;
      modeItem.hidden = ctx.ksmFormat === 'toml';
      const headline = modeItem.querySelector('[slot="headline"]');
      if (headline) {
        headline.textContent = ctx.ksmFormat === 'json'
          ? ctx.t({ key: 'ta_teesim_mode_title', fallback: 'Operation Mode' })
          : ctx.t({ key: 'ta_mode_menu', fallback: 'Default Mode' });
      }
      if (!modeItem.hidden && ctx.ksmFormat === 'json') {
        exec(`sh ${shellEscape(getModuleDir() + '/webroot/common/conflicts.sh')} status 2>/dev/null || echo '[]'`).then(({ stdout }) => {
          try {
            const entries = JSON.parse(stdout) as Array<{ key: string; prioritySpecter: boolean }>;
            const te = entries.find(e => e.key === 'teesim');
            if (te && !te.prioritySpecter) modeItem.hidden = true;
          } catch {}
        }).catch(() => {});
      }
    },
    menuActions: {
      'ta-refresh': refreshAction,
      'ta-select-all': selectAllAction,
      'ta-deselect-all': deselectAllAction,
      'ta-mode': ctx => {
        ctx.closeMenu();
        if (ctx.ksmFormat === 'json') openTeesimModeDialog();
        else if (ctx.supportsPerAppMode) void openModeSubpage(dialogsContext(ctx));
      },
      'ta-regenerate': ctx => {
        ctx.closeMenu();
        openRegenerateDialog(dialogsContext(ctx));
      },
      'ta-toggle-system': toggleSystemAction,
      'ta-toggle-mode': toggleModeAction,
      'ta-import-denylist': importDenylistAction,
    },
  };
}

export async function openTargetAppsManager(): Promise<void> {
  await openAppListPage(createTargetAdapter());
}
