// Shared markup and element lookup for the app-list overlays. The two pages
// keep their existing IDs/classes through an explicit spec; the builder only
// removes the copy-pasted skeleton/header/list structure.
import { escapeHtml } from './utils.js';
import { translateLabel, type AppLabel } from './app-list-model.js';

export interface AppListShellMenuItem {
  id: string;
  label: AppLabel;
  slotClass?: 'first' | 'last';
}

export interface AppListShellSpec {
  headerExtraClass?: string;
  titleExtraClass?: string;
  searchContainerExtraClass?: string;

  title: { id: string; label: AppLabel };
  back: { id: string; label: AppLabel };

  search: {
    inputId: string;
    clearId: string;
    buttonId: string;
    placeholder: AppLabel;
    clearLabel: AppLabel;
  };

  menu: {
    buttonId: string;
    id: string;
    buttonLabel: AppLabel;
    items: readonly AppListShellMenuItem[];
  };

  filtersId: string;
  listId: string;

  loading: { id: string; label: AppLabel };

  apply: { id: string; label: AppLabel };

  ptr: {
    indicatorId: string;
    arrowId: string;
  };

  skeletonRows?: number;
}

export interface AppListShellRefs {
  header: HTMLElement;
  titleEl: HTMLElement;
  backBtn: HTMLElement;
  searchContainer: HTMLElement;
  searchInput: MdOutlinedTextField;
  searchClearBtn: HTMLElement;
  searchBtn: HTMLButtonElement;
  menuBtn: HTMLElement;
  menu: MdMenu | null;
  filtersEl: HTMLElement;
  list: HTMLElement;
  loading: HTMLElement;
  applyBtn: HTMLElement & { disabled: boolean; label?: string };
  ptrIndicator: HTMLElement;
  ptrArrow: HTMLElement;
}

function extraClass(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

export function buildAppListShell(spec: AppListShellSpec): string {
  const skeletonRow = `
        <sp-settings-row variant="custom" class="ta-skeleton-row">
          <sp-skeleton slot="leading" variant="rounded" class="ta-skeleton-icon"></sp-skeleton>
          <span slot="headline"><sp-skeleton variant="text" class="ta-skeleton-title"></sp-skeleton></span>
          <span slot="supporting"><sp-skeleton variant="text" class="ta-skeleton-desc"></sp-skeleton></span>
          <sp-skeleton slot="trailing" variant="circular" class="ta-skeleton-state"></sp-skeleton>
        </sp-settings-row>`;

  const menuItems = spec.menu.items.map(item => {
    const cls = item.slotClass ? ` class="${escapeHtml(item.slotClass)}"` : '';
    return `
          <md-menu-item id="${escapeHtml(item.id)}"${cls}>
            <div slot="headline">${escapeHtml(translateLabel(item.label))}</div>
          </md-menu-item>`;
  }).join('');

  return `
    <div class="ta-inner">
      <div class="ptr-indicator" id="${escapeHtml(spec.ptr.indicatorId)}">
        <div class="ptr-progress-wrap">
          <md-icon id="${escapeHtml(spec.ptr.arrowId)}" class="ptr-arrow">refresh</md-icon>
        </div>
      </div>
      <header class="${escapeHtml(extraClass('subpage-header ta-header', spec.headerExtraClass))}">
        <button type="button" class="subpage-back-btn ta-back-btn" id="${escapeHtml(spec.back.id)}" aria-label="${escapeHtml(translateLabel(spec.back.label))}">
          <md-icon aria-hidden="true">arrow_back</md-icon>
          <md-ripple></md-ripple>
        </button>
        <h2 class="${escapeHtml(extraClass('subpage-title ta-title', spec.titleExtraClass))}" id="${escapeHtml(spec.title.id)}">${escapeHtml(translateLabel(spec.title.label))}</h2>
        <div class="${escapeHtml(extraClass('ta-search-container', spec.searchContainerExtraClass))}" hidden>
          <md-outlined-text-field id="${escapeHtml(spec.search.inputId)}" class="ta-search" placeholder="${escapeHtml(translateLabel(spec.search.placeholder))}" aria-label="${escapeHtml(translateLabel(spec.search.placeholder))}">
            <md-icon-button slot="trailing-icon" id="${escapeHtml(spec.search.clearId)}" aria-label="${escapeHtml(translateLabel(spec.search.clearLabel))}" style="display: none;">
              <md-icon aria-hidden="true">close</md-icon>
            </md-icon-button>
          </md-outlined-text-field>
        </div>
        <button id="${escapeHtml(spec.search.buttonId)}" class="ta-menu-btn" aria-label="${escapeHtml(translateLabel(spec.search.placeholder))}" aria-expanded="false">
          <md-icon aria-hidden="true">search</md-icon>
        </button>
        <button id="${escapeHtml(spec.menu.buttonId)}" class="ta-menu-btn" aria-label="${escapeHtml(translateLabel(spec.menu.buttonLabel))}">
          <md-icon aria-hidden="true">more_vert</md-icon>
        </button>
        <md-menu id="${escapeHtml(spec.menu.id)}" class="ta-menu" anchor="${escapeHtml(spec.menu.buttonId)}" positioning="fixed">${menuItems}
        </md-menu>
      </header>

      <div class="ta-filters" id="${escapeHtml(spec.filtersId)}"></div>

      <div class="ta-list" id="${escapeHtml(spec.listId)}" style="display: none"></div>

      <div class="ta-loading" id="${escapeHtml(spec.loading.id)}" role="status">
        <sp-settings-section aria-hidden="true">${skeletonRow.repeat(spec.skeletonRows ?? 8)}</sp-settings-section>
        <p>${escapeHtml(translateLabel(spec.loading.label))}</p>
      </div>
    </div>

    <md-fab id="${escapeHtml(spec.apply.id)}" class="ta-fab" label="${escapeHtml(translateLabel(spec.apply.label))}">
      <md-icon slot="icon">check</md-icon>
    </md-fab>
  `;
}

export function queryAppListShell(
  overlay: HTMLElement,
  spec: AppListShellSpec,
): AppListShellRefs {
  return {
    header: overlay.querySelector('.ta-header') as HTMLElement,
    titleEl: overlay.querySelector(`#${spec.title.id}`) as HTMLElement,
    backBtn: overlay.querySelector(`#${spec.back.id}`) as HTMLElement,
    searchContainer: overlay.querySelector('.ta-search-container') as HTMLElement,
    searchInput: overlay.querySelector(`#${spec.search.inputId}`) as MdOutlinedTextField,
    searchClearBtn: overlay.querySelector(`#${spec.search.clearId}`) as HTMLElement,
    searchBtn: overlay.querySelector(`#${spec.search.buttonId}`) as HTMLButtonElement,
    menuBtn: overlay.querySelector(`#${spec.menu.buttonId}`) as HTMLElement,
    menu: overlay.querySelector(`#${spec.menu.id}`) as MdMenu | null,
    filtersEl: overlay.querySelector(`#${spec.filtersId}`) as HTMLElement,
    list: overlay.querySelector(`#${spec.listId}`) as HTMLElement,
    loading: overlay.querySelector(`#${spec.loading.id}`) as HTMLElement,
    applyBtn: overlay.querySelector(`#${spec.apply.id}`) as HTMLElement & { disabled: boolean; label?: string },
    ptrIndicator: overlay.querySelector(`#${spec.ptr.indicatorId}`) as HTMLElement,
    ptrArrow: overlay.querySelector(`#${spec.ptr.arrowId}`) as HTMLElement,
  };
}
