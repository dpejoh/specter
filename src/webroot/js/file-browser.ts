import { shellEscape, escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';
import { exec } from './bridge.js';

interface FsEntry {
  name: string;
  isFolder: boolean;
  path: string;
}

export async function openFileBrowser(
  onSelect: (path: string) => void,
  opts?: { extensions?: string[]; emptyLabel?: string }
) {
  const t = (key: string, fallback: string) => getTranslation(key) || fallback;
  let currentPath = '/sdcard';
  let entries: FsEntry[] = [];
  let selectedFile: string | null = null;
  let allFiles = false;
  const extensions = opts?.extensions || ['.xml', '.bak'];
  const emptyLabel = opts?.emptyLabel || getTranslation('file_browser_empty') || 'No XML files found';

  const dialog = document.createElement('md-dialog');
  dialog.className = 'fb-dialog';

  const matchesExt = (name: string) => extensions.some(ext => name.endsWith(ext));

  function rowHTML(path: string, icon: string, name: string, isFolder: boolean, isSelected: boolean): string {
    const cls = 'fb-row' + (isFolder ? '' : ' fb-row--file') + (isSelected ? ' fb-row--selected' : '');
    const iconCls = 'fb-row-icon' + (isFolder ? ' fb-row-icon--folder' : ' fb-row-icon--file');
    return `<div class="${cls}" data-path="${escapeHtml(path)}">
      <span class="${iconCls}">
        <md-icon class="fb-row-icon-inner">${icon}</md-icon>
      </span>
      <span class="fb-row-name">${escapeHtml(name)}</span>
      ${isFolder ? '<md-icon class="fb-chevron">chevron_right</md-icon>' : ''}
    </div>`;
  }

  function render() {
    const dirs = entries.filter(e => e.isFolder);
    const files = entries.filter(e => !e.isFolder && (allFiles || matchesExt(e.name)));
    dialog.innerHTML = `
      <div slot="headline" class="fb-headline">
        ${currentPath !== '/sdcard' ? '<md-icon-button id="fb-back" class="fb-back-btn"><md-icon>arrow_back</md-icon></md-icon-button>' : ''}
        <span class="fb-path">${escapeHtml(currentPath)}</span>
      </div>
      <div slot="content" class="fb-content">
        ${currentPath !== '/' && currentPath !== '/sdcard' ? rowHTML('..', 'folder_open', '..', true, false) : ''}
        ${dirs.map(d => rowHTML(d.path, 'folder', d.name, true, false)).join('')}
        ${files.length === 0 && dirs.length === 0 ? '<div class="fb-empty">' + emptyLabel + '</div>' : ''}
        ${files.map(f => rowHTML(f.path, 'description', f.name, false, selectedFile === f.path)).join('')}
        ${!allFiles && files.length < entries.length ? '<div class="fb-show-all"><span id="fb-show-all">' + (getTranslation('file_browser_show_all') || 'Show all files') + '</span></div>' : ''}
      </div>
      <div slot="actions" class="fb-actions">
        <md-text-button id="fb-cancel">${t('dialog_close', 'Close')}</md-text-button>
        <div class="spacer"></div>
        <md-filled-button id="fb-select" class="fb-select-btn" ${selectedFile ? '' : 'disabled'}>${t('fb_select', 'Select')}</md-filled-button>
      </div>
    `;

    if (!document.body.contains(dialog)) {
      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));
    }

    dialog.querySelector('#fb-back')?.addEventListener('click', () => {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
      currentPath = parent === '/' || parent.startsWith('/sdcard') ? parent : '/sdcard';
      loadDir(currentPath);
    });
    dialog.querySelector('#fb-show-all')?.addEventListener('click', () => { allFiles = true; render(); });

    dialog.querySelectorAll('.fb-row').forEach(el => {
      el.addEventListener('click', async () => {
        const path = (el as HTMLElement).dataset.path;
        if (!path) return;
        if (path === '..') {
          currentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
          await loadDir(currentPath);
          return;
        }
        const entry = entries.find(e => e.path === path);
        if (entry?.isFolder) {
          currentPath = path.startsWith('/sdcard') ? path : '/sdcard';
          await loadDir(currentPath);
        } else {
          selectedFile = path;
          render();
        }
      });
    });

    dialog.querySelector('#fb-cancel')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('#fb-select')?.addEventListener('click', () => {
      if (selectedFile) { onSelect(selectedFile); dialog.close(); }
    });

    if (!document.body.contains(dialog)) {
      dialog.show();
    }
  }

  async function loadDir(path: string) {
    dialog.innerHTML = `
      <div slot="headline" class="fb-headline">
        <span class="fb-path">${escapeHtml(path)}</span>
      </div>
      <div slot="content" class="fb-loading">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    `;
    if (!document.body.contains(dialog)) {
      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));
      dialog.show();
    }
    try {
      const result = await exec(`ls -1p ${shellEscape(path)} 2>/dev/null | head -200`);
      const stdout = result.stdout || '';
      entries = stdout.split('\n').filter(Boolean).map((line: string) => ({
        name: line.replace(/\/$/, ''),
        isFolder: line.endsWith('/') && line !== '../',
        path: path + '/' + line.replace(/\/$/, '')
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

  await loadDir(currentPath);
}


