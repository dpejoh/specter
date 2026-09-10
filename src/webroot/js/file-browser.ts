import { shellEscape, escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';
import { exec } from './bridge.js';

interface FsEntry {
  name: string;
  isFolder: boolean;
  path: string;
}

function getFileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xml')) return 'vpn_key';
  if (lower.endsWith('.prop')) return 'tune';
  if (lower.endsWith('.bak')) return 'history';
  if (lower.endsWith('.json')) return 'data_object';
  if (lower.endsWith('.txt') || lower.endsWith('.log')) return 'article';
  return 'description';
}

function getFileTypeLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xml')) return 'XML Key Provider';
  if (lower.endsWith('.prop')) return 'Build Properties';
  if (lower.endsWith('.bak')) return 'Backup File';
  if (lower.endsWith('.json')) return 'JSON Document';
  return 'File';
}

export async function openFileBrowser(
  onSelect: (path: string) => void,
  opts?: { extensions?: string[]; emptyLabel?: string; title?: string }
): Promise<void> {
  const t = (key: string, fallback: string) => getTranslation(key) || fallback;
  let currentPath = '/sdcard';
  let entries: FsEntry[] = [];
  let selectedFile: string | null = null;
  let allFiles = false;
  let closed = false;
  let historySteps = 1;
  const extensions = opts?.extensions || ['.xml', '.bak'];
  const emptyLabel = opts?.emptyLabel || t('file_browser_empty', 'No XML files found');
  const pageTitle = opts?.title || t('fb_title', 'Select File');

  const overlay = document.createElement('div');
  overlay.className = 'subpage-overlay subpage-overlay--file-browser';
  overlay.id = 'subpage-file-browser';

  const matchesExt = (name: string) => extensions.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()));

  function renderBreadcrumbs(path: string): string {
    const norm = path.startsWith('/storage/emulated/0') ? '/sdcard' + path.slice('/storage/emulated/0'.length) : path;
    const crumbs: { label: string; path: string; icon?: string }[] = [];

    if (norm.startsWith('/sdcard')) {
      crumbs.push({ label: t('fb_internal_storage', 'Internal Storage'), path: '/sdcard', icon: 'smartphone' });
      let acc = '/sdcard';
      const rest = norm.slice('/sdcard'.length).split('/').filter(Boolean);
      for (const seg of rest) {
        acc += '/' + seg;
        crumbs.push({ label: seg, path: acc });
      }
    } else {
      let acc = '';
      const segments = norm.split('/').filter(Boolean);
      for (const seg of segments) {
        acc += '/' + seg;
        crumbs.push({ label: seg, path: acc });
      }
    }

    return crumbs.map((c, idx) => {
      const isLast = idx === crumbs.length - 1;
      return `
        <button type="button" class="fb-breadcrumb-chip ${isLast ? 'fb-breadcrumb-chip--active' : ''}" data-crumb="${escapeHtml(c.path)}">
          ${c.icon ? `<md-icon aria-hidden="true">${c.icon}</md-icon>` : ''}
          <span>${escapeHtml(c.label)}</span>
        </button>
        ${!isLast ? '<md-icon class="fb-breadcrumb-sep" aria-hidden="true">chevron_right</md-icon>' : ''}
      `;
    }).join('');
  }

  function render() {
    const dirs = entries.filter(e => e.isFolder);
    const files = entries.filter(e => !e.isFolder && (allFiles || matchesExt(e.name)));
    const totalFiles = entries.filter(e => !e.isFolder).length;
    const isAtRoot = currentPath === '/' || currentPath === '/sdcard' || currentPath === '/storage/emulated/0';

    overlay.innerHTML = `
      <div class="subpage-inner">
        <header class="subpage-header">
          <button type="button" class="subpage-back-btn" id="fb-back" aria-label="${t('dialog_cancel', 'Back')}">
            <md-icon aria-hidden="true">arrow_back</md-icon>
            <md-ripple></md-ripple>
          </button>
          <div class="subpage-header-title-wrap">
            <h1 class="subpage-title">${pageTitle}</h1>
            <span class="subpage-header-subtitle">${escapeHtml(currentPath)}</span>
          </div>
        </header>

        <div class="fb-subpage-pathbar">
          ${renderBreadcrumbs(currentPath)}
        </div>

        <div class="fb-filter-row">
          <div class="fb-filter-chip ${!allFiles ? 'fb-filter-chip--active' : ''}" id="fb-filter-toggle">
            <md-icon aria-hidden="true">${allFiles ? 'visibility' : 'filter_list'}</md-icon>
            <span>${allFiles ? t('fb_showing_all', 'Showing all files') : (extensions.join(', ') + ' files')}</span>
          </div>
          ${!allFiles && files.length < totalFiles ? `
            <md-text-button id="fb-show-all-btn" style="--md-text-button-label-text-size: 0.75rem;">
              ${t('file_browser_show_all', 'Show all files')}
            </md-text-button>
          ` : ''}
        </div>

        <div class="subpage-content" id="fb-scroll-area" style="padding-bottom: 24px;">
          ${!isAtRoot ? `
            <div class="list-container" style="margin-bottom: 12px;">
              <div class="list-item" data-path=".." id="fb-up-row">
                <div class="li-icon" style="background: var(--md-sys-color-surface-variant);">
                  <md-icon style="color: var(--md-sys-color-on-surface-variant);" aria-hidden="true">arrow_upward</md-icon>
                </div>
                <div class="list-item-content">
                  <div class="toggle-text">${t('fb_parent_folder', 'Parent folder')}</div>
                  <span class="supporting-text">..</span>
                </div>
                <div class="spacer"></div>
                <md-ripple></md-ripple>
              </div>
            </div>
          ` : ''}

          ${dirs.length > 0 ? `
            <h2 class="list-title">${t('fb_folder', 'Folders')}</h2>
            <div class="list-container" style="margin-bottom: 16px;">
              ${dirs.map(d => `
                <div class="list-item" data-path="${escapeHtml(d.path)}">
                  <div class="li-icon" style="background: var(--md-sys-color-primary-container);">
                    <md-icon style="color: var(--md-sys-color-on-primary-container);" aria-hidden="true">folder</md-icon>
                  </div>
                  <div class="list-item-content">
                    <div class="toggle-text">${escapeHtml(d.name)}</div>
                    <span class="supporting-text">${t('fb_folder', 'Folder')}</span>
                  </div>
                  <div class="spacer"></div>
                  <md-icon style="color: var(--md-sys-color-outline);" aria-hidden="true">chevron_right</md-icon>
                  <md-ripple></md-ripple>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${files.length > 0 ? `
            <h2 class="list-title">${t('fb_title', 'Files')}</h2>
            <div class="list-container">
              ${files.map(f => {
                const isSelected = selectedFile === f.path;
                return `
                  <div class="list-item ${isSelected ? 'list-item--selected' : ''}" data-path="${escapeHtml(f.path)}" data-is-file="true">
                    <div class="li-icon" style="background: ${isSelected ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-secondary-container)'};">
                      <md-icon style="color: ${isSelected ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-secondary-container)'};" aria-hidden="true">${getFileIcon(f.name)}</md-icon>
                    </div>
                    <div class="list-item-content">
                      <div class="toggle-text">${escapeHtml(f.name)}</div>
                      <span class="supporting-text">${getFileTypeLabel(f.name)}</span>
                    </div>
                    <div class="spacer"></div>
                    ${isSelected ? `<md-icon style="color: var(--md-sys-color-primary); font-size: 24px;" aria-hidden="true">check_circle</md-icon>` : ''}
                    <md-ripple></md-ripple>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}

          ${files.length === 0 && dirs.length === 0 ? `
            <div class="list-container">
              <div class="list-item fb-empty-state" style="cursor: default;">
                <md-icon aria-hidden="true">folder_off</md-icon>
                <div class="fb-empty-title">${emptyLabel}</div>
                ${!allFiles ? `
                  <md-filled-tonal-button id="fb-empty-show-all">
                    <md-icon slot="icon" aria-hidden="true">visibility</md-icon>
                    ${t('file_browser_show_all', 'Show all files')}
                  </md-filled-tonal-button>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <footer class="subpage-footer fb-footer">
          <md-text-button id="fb-cancel">
            <md-icon slot="icon" aria-hidden="true">close</md-icon>
            ${t('dialog_cancel', 'Cancel')}
          </md-text-button>
          <div class="fb-selected-preview">
            ${selectedFile ? `
              <md-icon aria-hidden="true" style="font-size: 16px; color: var(--md-sys-color-primary);">check_circle</md-icon>
              <span class="fb-selected-name">${escapeHtml(selectedFile.split('/').pop() || selectedFile)}</span>
            ` : `
              <span class="fb-no-file-msg">${t('fb_none_selected', 'No file selected')}</span>
            `}
          </div>
          <md-filled-button id="fb-select" ${selectedFile ? '' : 'disabled'}>
            <md-icon slot="icon" aria-hidden="true">check</md-icon>
            ${t('fb_select', 'Select')}
          </md-filled-button>
        </footer>
      </div>
    `;

    // Wire breadcrumbs
    overlay.querySelectorAll('.fb-breadcrumb-chip').forEach(el => {
      el.addEventListener('click', () => {
        const crumbPath = (el as HTMLElement).dataset.crumb;
        if (crumbPath && crumbPath !== currentPath) {
          loadDir(crumbPath);
        }
      });
    });

    // Wire filter toggle
    overlay.querySelector('#fb-filter-toggle')?.addEventListener('click', () => {
      allFiles = !allFiles;
      render();
    });
    overlay.querySelector('#fb-show-all-btn')?.addEventListener('click', () => {
      allFiles = true;
      render();
    });
    overlay.querySelector('#fb-empty-show-all')?.addEventListener('click', () => {
      allFiles = true;
      render();
    });

    // Wire folder and file item clicks
    overlay.querySelectorAll('.list-item[data-path]').forEach(el => {
      el.addEventListener('click', () => {
        const path = (el as HTMLElement).dataset.path;
        if (!path) return;
        const isFile = (el as HTMLElement).dataset.isFile === 'true';

        if (path === '..') {
          const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/sdcard';
          loadDir(parent.startsWith('/sdcard') || parent === '/' ? parent : '/sdcard');
          return;
        }

        if (isFile) {
          if (selectedFile === path) {
            onSelect(path);
            closeOverlay(true);
          } else {
            selectedFile = path;
            render();
          }
        } else {
          loadDir(path);
        }
      });
    });

    // Wire header back
    overlay.querySelector('#fb-back')?.addEventListener('click', () => {
      if (!isAtRoot) {
        history.back();
      } else {
        closeOverlay(true);
      }
    });

    // Wire footer actions
    overlay.querySelector('#fb-cancel')?.addEventListener('click', () => closeOverlay(true));
    overlay.querySelector('#fb-select')?.addEventListener('click', () => {
      if (selectedFile) {
        onSelect(selectedFile);
        closeOverlay(true);
      }
    });
  }

  function closeOverlay(popHistory = true) {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPopState);
    overlay.classList.remove('subpage-overlay--open');

    const hasRemaining = document.querySelectorAll('.subpage-overlay--open').length > 0;
    if (!hasRemaining) {
      window.isOverlayOpen = false;
      document.documentElement.style.overflow = '';
    }

    if (popHistory && historySteps > 0) {
      history.go(-historySteps);
    }

    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function onPopState(e: PopStateEvent) {
    historySteps--;
    if (e.state && e.state.subpage === 'file-browser') {
      currentPath = e.state.path || '/sdcard';
      loadDir(currentPath, false);
    } else {
      closeOverlay(false);
    }
  }

  async function loadDir(path: string, pushHistory = true) {
    currentPath = path;
    if (pushHistory) {
      historySteps++;
      history.pushState({ subpage: 'file-browser', path: currentPath }, '');
    }

    overlay.innerHTML = `
      <div class="subpage-inner">
        <header class="subpage-header">
          <button type="button" class="subpage-back-btn" id="fb-back" aria-label="${t('dialog_cancel', 'Back')}">
            <md-icon aria-hidden="true">arrow_back</md-icon>
            <md-ripple></md-ripple>
          </button>
          <div class="subpage-header-title-wrap">
            <h1 class="subpage-title">${pageTitle}</h1>
            <span class="subpage-header-subtitle">${escapeHtml(path)}</span>
          </div>
        </header>
        <div class="fb-subpage-pathbar">
          ${renderBreadcrumbs(path)}
        </div>
        <div class="fb-loading">
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
      </div>
    `;

    overlay.querySelector('#fb-back')?.addEventListener('click', () => {
      history.back();
    });

    try {
      const result = await exec(`ls -1p ${shellEscape(path)} 2>/dev/null | head -200`);
      const stdout = result.stdout || '';
      entries = stdout.split('\n').filter(Boolean).map((line: string) => ({
        name: line.replace(/\/$/, ''),
        isFolder: line.endsWith('/') && line !== '../',
        path: path.replace(/\/$/, '') + '/' + line.replace(/\/$/, '')
      })).filter((e: FsEntry) => e.name !== '.' && e.name !== '..');
      selectedFile = null;
      allFiles = false;
      render();
    } catch (e) {
      console.warn('Directory listing failed:', e);
      entries = [];
      render();
    }
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('subpage-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ subpage: 'file-browser', path: currentPath }, '');
  window.addEventListener('popstate', onPopState);

  await loadDir(currentPath, false);
}


