import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';
import '@material/web/switch/switch.js';
import { exec, getModuleDir, getDataDir } from './bridge.js';
import { cfgGet, cfgSet } from './cfg.js';
import { shellEscape } from './utils.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';
import { appendToOutput } from './terminal.js';
import { TRICKY_DIR } from './constants.js';

type TargetState = 'unchecked' | 'bare' | 'conditional' | 'force';
type BlacklistState = 'unchecked' | 'blacklisted';
type AppState = TargetState | BlacklistState;
type Mode = 'target' | 'blacklist';

interface TargetApp {
  packageName: string;
  appName: string;
  state: AppState;
}

const ANDROID_PATH = 'M40-240q9-107 65.5-197T256-580l-74-128q-6-9-3-19t13-15q8-5 18-2t16 12l74 128q86-36 180-36t180 36l74-128q6-9 16-12t18 2q10 5 13 15t-3 19l-74 128q94 53 150.5 143T920-240H40Zm275.5-124.5Q330-379 330-400t-14.5-35.5Q301-450 280-450t-35.5 14.5Q230-421 230-400t14.5 35.5Q259-350 280-350t35.5-14.5Zm400 0Q730-379 730-400t-14.5-35.5Q701-450 680-450t-35.5 14.5Q630-421 630-400t14.5 35.5Q659-350 680-350t35.5-14.5Z';

function themedFallbackIcon(): string {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bg = cs.getPropertyValue('--md-sys-color-surface-container-highest').trim() || '#e6e0e9';
  const fg = cs.getPropertyValue('--md-sys-color-on-surface-variant').trim() || '#49454f';
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 -960 960 960">`
    + `<circle cx="480" cy="-480" r="460" fill="${bg}"/>`
    + `<g transform="matrix(0.7 0 0 0.7 144 -144)"><path fill="${fg}" d="${ANDROID_PATH}"/></g></svg>`
  );
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

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function ksuGlobal(): any {
  return (globalThis as any).ksu;
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

class AppIconManager {
  private observer: IntersectionObserver | null = null;

  watchAll(): void {
    if (!this.observer) {
      this.observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const img = el.querySelector('.sp-icn') as HTMLImageElement | null;
          const spin = el.querySelector('.sp-icn-spin') as HTMLElement | null;
          const pkg = img?.dataset.package;
          if (pkg && img && spin) {
            this.fetch(pkg, img, spin);
            this.observer?.unobserve(el);
          }
        }
      }, { rootMargin: '100px', threshold: 0.1 });
    }
    document.querySelectorAll('.sp-icn-w').forEach(el => this.observer!.observe(el));
    const ksu = ksuGlobal();
    if (typeof ksu?.listPackages === 'function') {
      document.querySelectorAll('.sp-icn-w').forEach(el => {
        (el as HTMLElement).style.display = 'flex';
      });
    }
  }

  createElements(pkg: string): { wrap: HTMLDivElement; img: HTMLImageElement; spin: HTMLDivElement } {
    const wrap = document.createElement('div');
    wrap.className = 'sp-icn-w';
    const spin = document.createElement('div');
    spin.className = 'sp-icn-spin';
    spin.dataset.package = pkg;
    const img = document.createElement('img');
    img.className = 'sp-icn';
    img.dataset.package = pkg;
    img.alt = '';
    img.loading = 'lazy';
    wrap.appendChild(spin);
    wrap.appendChild(img);
    return { wrap, img, spin };
  }

  private fetch(pkg: string, img: HTMLImageElement, spin: HTMLElement): void {
    const done = () => { spin.style.display = 'none'; img.style.opacity = '1'; };
    const fail = () => { img.src = themedFallbackIcon(); done(); };
    img.onload = done;
    img.onerror = fail;

    const pm = (globalThis as any).$packageManager;
    if (typeof pm?.getApplicationIcon === 'function') {
      try {
        const uri = pm.getApplicationIcon(pkg, 0, 0) as string;
        if (uri) {
          fetch(uri).then(r => r.arrayBuffer()).then(b => {
            img.src = 'data:image/png;base64,' + bufToB64(b);
          }).catch(fail);
          return;
        }
      } catch {}
    }
    if (typeof ksuGlobal()?.getPackagesInfo === 'function') {
      img.src = 'ksu://icon/' + pkg;
      return;
    }
    fail();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
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
    for (const app of apps) app.state = mode === 'blacklist' ? 'blacklisted' : (defaultMode as AppState);
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
      exec(`cat ${TRICKY_DIR}/target.txt 2>/dev/null || echo ""`).then(({ stdout }) => {
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

  overlay.querySelector('#ta-regenerate')!.addEventListener('click', () => {
    closeTapMenu();
    openRegenerateDialog();
  });

  overlay.querySelector('#ta-mode')!.addEventListener('click', () => {
    closeTapMenu();
    openModeDialog();
  });

  function paintSeg(root: HTMLElement): void {
    const rootStyle = document.documentElement.style;
    const hex: Record<string, [string, string]> = {
      bare: [rootStyle.getPropertyValue('--md-sys-color-primary').trim(), rootStyle.getPropertyValue('--md-sys-color-on-primary').trim()],
      conditional: [rootStyle.getPropertyValue('--md-sys-color-tertiary').trim(), rootStyle.getPropertyValue('--md-sys-color-on-tertiary').trim()],
      force: [rootStyle.getPropertyValue('--md-sys-color-error').trim(), rootStyle.getPropertyValue('--md-sys-color-on-error').trim()],
    };
    const inject = (btn: Element) => {
      const sr = btn.shadowRoot;
      if (!sr) { requestAnimationFrame(() => inject(btn)); return; }
      const val = btn.getAttribute('value');
      if (!val) return;
      const h = hex[val];
      if (!h || !h[0] || !h[1]) return;
      const [bg, fg] = h;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`.md3-segmented-button--selected{background-color:${bg}}.md3-segmented-button.md3-segmented-button--selected:enabled .md3-segmented-button__label-text{color:${fg}}.md3-segmented-button.md3-segmented-button--selected:enabled:hover .md3-segmented-button__label-text{color:${fg}}.md3-segmented-button.md3-segmented-button--selected:enabled:focus .md3-segmented-button__label-text{color:${fg}}.md3-segmented-button.md3-segmented-button--selected:enabled:active .md3-segmented-button__label-text{color:${fg}}.md3-segmented-button--selected .md3-segmented-button__icon{color:${fg}}.md3-segmented-button--selected .md3-segmented-button__checkmark-path{stroke:${fg}}.md3-segmented-button--selected:hover .md3-segmented-button__checkmark-path{stroke:${fg}}.md3-segmented-button--selected:focus .md3-segmented-button__checkmark-path{stroke:${fg}}.md3-segmented-button--selected:active .md3-segmented-button__checkmark-path{stroke:${fg}}`);
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
    };
    root.querySelectorAll('md-outlined-segmented-button').forEach(inject);

    const set = root.querySelector('md-outlined-segmented-button-set');
    if (set) {
      const injectFlex = () => {
        const sr = set.shadowRoot;
        if (!sr) { requestAnimationFrame(injectFlex); return; }
        const s = new CSSStyleSheet();
        s.replaceSync('::slotted(md-outlined-segmented-button){flex:1;min-width:0}');
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, s];
      };
      injectFlex();
    }
  }

  function openModeDialog() {
    const d = document.createElement('md-dialog');
    d.innerHTML = `
      <div slot="headline">${t('ta_mode_settings', 'Default Mode')}</div>
      <div slot="content" class="ta-mode-content">
        <p class="supporting-text ta-mode-desc">${t('ta_mode_desc', 'Controls the default mode suffix added to new app targets in Tricky Store')}</p>
        <md-outlined-segmented-button-set>
          <md-outlined-segmented-button value="bare"${defaultMode === 'bare' ? ' selected' : ''} label="${t('ta_mode_bare', 'Auto')}"></md-outlined-segmented-button>
          <md-outlined-segmented-button value="conditional"${defaultMode === 'conditional' ? ' selected' : ''} label="? ${t('ta_mode_conditional', 'Leaf')}"></md-outlined-segmented-button>
          <md-outlined-segmented-button value="force"${defaultMode === 'force' ? ' selected' : ''} label="! ${t('ta_mode_force', 'Gen')}"></md-outlined-segmented-button>
        </md-outlined-segmented-button-set>
        <div class="list-item list-item--toggle">
          <div class="li-icon"><md-icon aria-hidden="true">compare_arrows</md-icon></div>
          <div class="list-item-content">
            <div class="toggle-text">${t('ta_mode_override_label', 'Override existing')}</div>
            <span class="supporting-text">${t('ta_mode_override_desc', 'Apply this mode to all currently selected apps')}</span>
          </div>
          <div class="spacer"></div>
          <md-switch icons id="ta-mode-do-override"></md-switch>
        </div>
      </div>
      <div slot="actions">
        <md-text-button class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
        <md-filled-button id="ta-mode-apply">${t('dialog_apply', 'Apply')}</md-filled-button>
      </div>
    `;
    document.body.appendChild(d);
    d.addEventListener('close', () => document.body.removeChild(d));

    let _mode = defaultMode;
    d.querySelectorAll('md-outlined-segmented-button').forEach(b => {
      b.addEventListener('click', () => { _mode = b.getAttribute('value') || 'bare'; });
    });
    d.querySelector('#ta-mode-apply')!.addEventListener('click', () => {
      defaultMode = _mode;
      cfgSet('target_default_mode', _mode);
      const doOverride = (d.querySelector('#ta-mode-do-override') as any)?.selected;
      let count = 0;
      if (doOverride) {
        for (const app of apps) {
          if (app.state !== 'unchecked') {
            app.state = _mode as AppState;
            count++;
          }
        }
        applyFilters();
      }
      d.close();
      if (count > 0) {
        showToast(t('ta_mode_applied_both', 'Default saved, {count} apps overridden').replace('{count}', String(count)), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      } else {
        showToast(t('ta_default_saved', 'Default mode saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      }
    });
    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
    d.show();
    paintSeg(d);
  }

  function openRegenerateDialog() {
    const d = document.createElement('md-dialog');
    d.innerHTML = `
      <div slot="headline">${t('ta_regenerate', 'Regenerate')}</div>
      <div slot="content">
        <p class="supporting-text">${t('ta_regenerate_confirm', 'This will re-scan all installed apps and fully rebuild target.txt. Custom per-app states will be overwritten. A backup will be saved.')}</p>
      </div>
      <div slot="actions">
        <md-text-button class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
        <md-filled-button id="ta-regenerate-confirm">${t('ta_regenerate', 'Regenerate')}</md-filled-button>
      </div>
    `;
    document.body.appendChild(d);
    d.addEventListener('close', () => document.body.removeChild(d));

    d.querySelector('#ta-regenerate-confirm')!.addEventListener('click', async () => {
      d.close();
      loading.style.display = '';
      list.style.display = 'none';

      appendToOutput('[TARGET] Regenerating target.txt from all apps...');
      try {
        await exec(`sh ${shellEscape(getModuleDir() + '/features/target.sh')}`);
        appendToOutput('[TARGET] Regeneration complete');
        showToast(t('ta_regenerate_success', 'Target list regenerated'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        await refreshApps();
      } catch (e) {
        appendToOutput(`[TARGET] Regeneration failed: ${e}`, true);
      } finally {
        loading.style.display = 'none';
        list.style.display = '';
      }
    });

    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
    d.show();
  }

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
      const sysSet = new Set(sysPkgs);
      apps = apps.filter(a => !sysSet.has(a.packageName));
      headline.textContent = t('ta_show_system', 'Show system apps');
    }
    applyFilters();
    closeTapMenu();
  });

  async function loadData() {
    try {
      const ksu = ksuGlobal();
      if (typeof ksu?.cacheAllPackageIcons === 'function') {
        try { ksu.cacheAllPackageIcons(48); } catch {}
      }
      defaultMode = (await cfgGet('target_default_mode', 'bare')) || 'bare';
      const [targetResult, pkgs] = await Promise.all([
        exec(`cat ${TRICKY_DIR}/target.txt 2>/dev/null || echo ""`),
        fetchUserPackages(),
      ]);

      const targetLines = targetResult.stdout.split('\n').map(s => s.trim()).filter(Boolean);
      targetMap.clear();
      for (const line of targetLines) {
        if (line.endsWith('!')) targetMap.set(line.slice(0, -1), 'force');
        else if (line.endsWith('?')) targetMap.set(line.slice(0, -1), 'conditional');
        else targetMap.set(line, 'bare');
      }

      const labelMap = await resolvePackageNames(pkgs);

      apps = pkgs.map(pkg => ({
        packageName: pkg,
        appName: labelMap.get(pkg) || pkg,
        state: targetMap.get(pkg) || 'unchecked',
      }));

      appendToOutput(`[TARGET] Loaded ${apps.length} user apps, ${targetMap.size} in target.txt`);
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
        exec(`cat ${TRICKY_DIR}/target.txt 2>/dev/null || echo ""`),
        fetchUserPackages(),
      ]);

      const targetLines = targetResult.stdout.split('\n').map(s => s.trim()).filter(Boolean);
      targetMap.clear();
      for (const line of targetLines) {
        if (line.endsWith('!')) targetMap.set(line.slice(0, -1), 'force');
        else if (line.endsWith('?')) targetMap.set(line.slice(0, -1), 'conditional');
        else targetMap.set(line, 'bare');
      }

      const labelMap = await resolvePackageNames(pkgs);

      apps = pkgs.map(pkg => ({
        packageName: pkg,
        appName: labelMap.get(pkg) || pkg,
        state: targetMap.get(pkg) || 'unchecked',
      }));

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
          applyAppState(app.state === 'unchecked' ? (defaultMode as AppState) : 'unchecked');
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
          if (a.state === 'force') return a.packageName + '!';
          if (a.state === 'conditional') return a.packageName + '?';
          return a.packageName;
        })
        .sort();

      const content = lines.join('\n');
      try {
        await exec(`cat > ${TRICKY_DIR}/target.txt << 'TEOF'\n${content}\nTEOF`);
        appendToOutput(`[TARGET] Wrote ${lines.length} entries to target.txt`);
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
