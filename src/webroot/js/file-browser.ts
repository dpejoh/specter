import { shellEscape, escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';
import { exec } from './bridge.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import type { MdMenu } from '@material/web/menu/menu.js';

interface FsEntry {
  name: string;
  isFolder: boolean;
  path: string;
  size: number;
  mtime: number;
}

interface FileVisual {
  icon: string;
  typeLabel: string;
  bgStyle: string;
  iconStyle: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size < 10 && i > 0 ? size.toFixed(2) : size < 100 && i > 0 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}

function formatDate(epochSec: number): string {
  if (!epochSec || isNaN(epochSec)) return '';
  const date = new Date(epochSec * 1000);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) {
    return `Today, ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`;
  }

  const month = date.toLocaleDateString([], { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();

  if (year === now.getFullYear()) {
    return `${month} ${day}, ${time}`;
  }
  return `${month} ${day}, ${year}`;
}

function getFileVisual(name: string): FileVisual {
  const lower = name.toLowerCase();

  // Keys & Attestation
  if (lower.endsWith('.xml')) {
    return {
      icon: 'vpn_key',
      typeLabel: 'XML Key Provider',
      bgStyle: 'background: #441a33;',
      iconStyle: 'color: #f48fb1;',
    };
  }
  if (lower.endsWith('.key') || lower.endsWith('.pem') || lower.endsWith('.crt') || lower.endsWith('.cer') || lower.endsWith('.der')) {
    return {
      icon: 'key',
      typeLabel: 'Certificate / Key',
      bgStyle: 'background: #441a33;',
      iconStyle: 'color: #f48fb1;',
    };
  }

  // Archives
  if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz') || lower.endsWith('.tgz') ||
      lower.endsWith('.bz2') || lower.endsWith('.xz') || lower.endsWith('.7z') || lower.endsWith('.rar')) {
    return {
      icon: 'folder_zip',
      typeLabel: 'Archive',
      bgStyle: 'background: #4a2912;',
      iconStyle: 'color: #ffb74d;',
    };
  }

  // Android Packages
  if (lower.endsWith('.apk') || lower.endsWith('.apks') || lower.endsWith('.xapk') || lower.endsWith('.apkm')) {
    return {
      icon: 'android',
      typeLabel: 'Android Package',
      bgStyle: 'background: #194022;',
      iconStyle: 'color: #81c784;',
    };
  }

  // Scripts & Code
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) {
    return {
      icon: 'terminal',
      typeLabel: 'Shell Script',
      bgStyle: 'background: #1d2b3a;',
      iconStyle: 'color: #64b5f6;',
    };
  }
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.py') || lower.endsWith('.c') || lower.endsWith('.cpp')) {
    return {
      icon: 'code',
      typeLabel: 'Source Code',
      bgStyle: 'background: #1d2b3a;',
      iconStyle: 'color: #64b5f6;',
    };
  }

  // Configuration & Properties
  if (lower.endsWith('.prop') || lower.endsWith('.conf') || lower.endsWith('.ini') || lower.endsWith('.cfg')) {
    return {
      icon: 'tune',
      typeLabel: 'Build Properties',
      bgStyle: 'background: #19383b;',
      iconStyle: 'color: #80cbc4;',
    };
  }
  if (lower.endsWith('.json') || lower.endsWith('.toml') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return {
      icon: 'data_object',
      typeLabel: 'Structured Config',
      bgStyle: 'background: #19383b;',
      iconStyle: 'color: #80cbc4;',
    };
  }

  // Media
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
    return {
      icon: 'image',
      typeLabel: 'Image',
      bgStyle: 'background: #1e3629;',
      iconStyle: 'color: #a5d6a7;',
    };
  }
  if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.flac') || lower.endsWith('.wav') || lower.endsWith('.m4a') || lower.endsWith('.aac')) {
    return {
      icon: 'audio_file',
      typeLabel: 'Audio',
      bgStyle: 'background: #371e3d;',
      iconStyle: 'color: #ce93d8;',
    };
  }
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.webm') || lower.endsWith('.avi') || lower.endsWith('.mov')) {
    return {
      icon: 'video_file',
      typeLabel: 'Video',
      bgStyle: 'background: #3e1b1b;',
      iconStyle: 'color: #ef9a9a;',
    };
  }

  // Documents
  if (lower.endsWith('.pdf')) {
    return {
      icon: 'picture_as_pdf',
      typeLabel: 'PDF Document',
      bgStyle: 'background: #421b1d;',
      iconStyle: 'color: #e57373;',
    };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.md')) {
    return {
      icon: 'article',
      typeLabel: 'Text Document',
      bgStyle: 'background: #2b2b35;',
      iconStyle: 'color: #b0bec5;',
    };
  }
  if (lower.endsWith('.bak')) {
    return {
      icon: 'history',
      typeLabel: 'Backup File',
      bgStyle: 'background: #282833;',
      iconStyle: 'color: #9e9e9e;',
    };
  }

  return {
    icon: 'description',
    typeLabel: 'File',
    bgStyle: 'background: #28272e;',
    iconStyle: 'color: #c7c5d0;',
  };
}

interface Breadcrumb {
  label: string;
  path: string;
  isCurrent: boolean;
}

function getBreadcrumbs(path: string, rootLabel: string): Breadcrumb[] {
  const norm = path.startsWith('/storage/emulated/0')
    ? '/sdcard' + path.slice('/storage/emulated/0'.length)
    : path;

  if (norm === '/' || norm === '/sdcard') {
    return [{ label: rootLabel, path: '/sdcard', isCurrent: true }];
  }

  const crumbs: Breadcrumb[] = [];

  if (norm.startsWith('/sdcard')) {
    crumbs.push({ label: rootLabel, path: '/sdcard', isCurrent: false });
    const parts = norm.slice('/sdcard/'.length).split('/').filter(Boolean);
    let accum = '/sdcard';
    parts.forEach((part, idx) => {
      accum += '/' + part;
      crumbs.push({
        label: part,
        path: accum,
        isCurrent: idx === parts.length - 1,
      });
    });
  } else {
    crumbs.push({ label: 'Root', path: '/', isCurrent: false });
    const parts = norm.split('/').filter(Boolean);
    let accum = '';
    parts.forEach((part, idx) => {
      accum += '/' + part;
      crumbs.push({
        label: part,
        path: accum,
        isCurrent: idx === parts.length - 1,
      });
    });
  }

  return crumbs;
}

function renderBreadcrumbsHtml(path: string, rootLabel: string): string {
  const crumbs = getBreadcrumbs(path, rootLabel);
  return crumbs.map((c, idx) => {
    const isLast = idx === crumbs.length - 1;
    if (isLast) {
      return `<span class="fb-crumb fb-crumb--current">${escapeHtml(c.label)}</span>`;
    }
    return `
      <button type="button" class="fb-crumb" data-crumb-path="${escapeHtml(c.path)}">
        ${escapeHtml(c.label)}
        <md-ripple></md-ripple>
      </button>
      <md-icon class="fb-crumb-sep" aria-hidden="true">chevron_right</md-icon>
    `;
  }).join('');
}

// Persist the user's filter choice (All Files vs Primary) across directory navigations and session
let savedAllFilesFilter = false;

export async function openFileBrowser(
  onSelect: (path: string) => void,
  opts?: { extensions?: string[]; emptyLabel?: string; title?: string }
): Promise<void> {
  const t = (key: string, fallback: string) => getTranslation(key) || fallback;
  let currentPath = '/sdcard';
  let entries: FsEntry[] = [];
  let allFiles = savedAllFilesFilter;
  let closed = false;
  let historySteps = 1;
  const extensions = opts?.extensions || ['.xml', '.bak'];
  const pageTitle = opts?.title || t('fb_internal_storage', 'Internal storage');

  const overlay = document.createElement('div');
  overlay.className = 'subpage-overlay subpage-overlay--file-browser';
  overlay.id = 'subpage-file-browser';

  const matchesExt = (name: string) => extensions.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()));

  const filterLabel = extensions.some(e => e.toLowerCase().includes('xml'))
    ? t('fb_filter_keybox', 'Keybox Files')
    : (extensions.join(', ') + ' files');

  function render() {
    const dirs = entries.filter(e => e.isFolder);
    const files = entries.filter(e => !e.isFolder && (allFiles || matchesExt(e.name)));

    // Natural alphanumeric sorting
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

    const hasItems = dirs.length > 0 || files.length > 0;
    const isAtRoot = currentPath === '/' || currentPath === '/sdcard' || currentPath === '/storage/emulated/0';
    const emptyMsg = allFiles ? t('fb_folder_empty', 'This folder is empty') : (opts?.emptyLabel || t('file_browser_empty', 'No XML files found'));

    overlay.innerHTML = `
      <div class="subpage-inner">
        <header class="subpage-header">
          <button type="button" class="subpage-back-btn" id="fb-back" aria-label="${t('dialog_cancel', 'Back')}">
            <md-icon aria-hidden="true">arrow_back</md-icon>
            <md-ripple></md-ripple>
          </button>
          <div class="subpage-header-title-wrap">
            <h1 class="subpage-title">${pageTitle}</h1>
          </div>
          <div style="position: relative;">
            <button type="button" class="subpage-action-btn" id="fb-menu-btn" aria-label="${t('ta_menu_more', 'More options')}">
              <md-icon aria-hidden="true">more_vert</md-icon>
              <md-ripple></md-ripple>
            </button>
            <md-menu id="fb-menu" class="fb-menu" anchor="fb-menu-btn" positioning="fixed">
              <md-menu-item id="fb-menu-filter-primary" class="first">
                <md-icon slot="start" aria-hidden="true" style="${!allFiles ? 'color: var(--md-sys-color-primary);' : 'visibility: hidden;'}">check</md-icon>
                <div slot="headline">${filterLabel}</div>
              </md-menu-item>
              <md-menu-item id="fb-menu-filter-all" class="last">
                <md-icon slot="start" aria-hidden="true" style="${allFiles ? 'color: var(--md-sys-color-primary);' : 'visibility: hidden;'}">check</md-icon>
                <div slot="headline">${t('fb_all_files', 'All Files')}</div>
              </md-menu-item>
            </md-menu>
          </div>
        </header>

        <div class="fb-breadcrumbs-wrap">
          <nav class="fb-breadcrumbs" id="fb-breadcrumbs" aria-label="Breadcrumb">
            ${renderBreadcrumbsHtml(currentPath, t('fb_internal_storage', 'Internal storage'))}
          </nav>
        </div>

        <div class="subpage-content ${!hasItems ? 'fb-content--empty' : ''}" id="fb-scroll-area">
          ${hasItems ? `
            <div class="fb-list">
              ${dirs.map(d => {
                const dateStr = formatDate(d.mtime);
                return `
                <div class="fb-row" data-path="${escapeHtml(d.path)}">
                  <div class="fb-icon" style="background: #393552;">
                    <md-icon style="color: #d0bcff;" aria-hidden="true">folder</md-icon>
                  </div>
                  <div class="fb-text-col">
                    <div class="fb-name">${escapeHtml(d.name)}</div>
                    <div class="fb-meta">
                      <span class="fb-meta-size">${t('fb_folder', 'Folder')}</span>
                      ${dateStr ? `<span class="fb-meta-dot">•</span><span class="fb-meta-date">${dateStr}</span>` : ''}
                    </div>
                  </div>
                  <md-icon class="fb-chevron" aria-hidden="true">chevron_right</md-icon>
                  <md-ripple></md-ripple>
                </div>
              `;
              }).join('')}
              ${files.map(f => {
                const visual = getFileVisual(f.name);
                const sizeStr = formatFileSize(f.size);
                const dateStr = formatDate(f.mtime);
                return `
                <div class="fb-row" data-path="${escapeHtml(f.path)}" data-is-file="true">
                  <div class="fb-icon" style="${visual.bgStyle}">
                    <md-icon style="${visual.iconStyle}" aria-hidden="true">${visual.icon}</md-icon>
                  </div>
                  <div class="fb-text-col">
                    <div class="fb-name">${escapeHtml(f.name)}</div>
                    <div class="fb-meta">
                      <span class="fb-meta-size">${sizeStr || visual.typeLabel}</span>
                      ${dateStr ? `<span class="fb-meta-dot">•</span><span class="fb-meta-date">${dateStr}</span>` : ''}
                    </div>
                  </div>
                  <md-ripple></md-ripple>
                </div>
              `;
              }).join('')}
            </div>
          ` : `
            <div class="fb-empty-state">
              <div class="fb-empty-title">${emptyMsg}</div>
            </div>
          `}
        </div>
      </div>
    `;

    // Wire breadcrumbs navigation
    overlay.querySelectorAll('.fb-crumb[data-crumb-path]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = (btn as HTMLElement).dataset.crumbPath;
        if (p && p !== currentPath) {
          loadDir(p);
        }
      });
    });

    const breadcrumbsEl = overlay.querySelector('#fb-breadcrumbs') as HTMLElement | null;
    if (breadcrumbsEl) {
      breadcrumbsEl.scrollLeft = breadcrumbsEl.scrollWidth;
    }

    // Wire 3-dots menu
    const menuBtn = overlay.querySelector('#fb-menu-btn');
    const menu = overlay.querySelector('#fb-menu') as MdMenu | null;
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu) menu.open = !menu.open;
    });

    overlay.querySelector('#fb-menu-filter-primary')?.addEventListener('click', () => {
      if (menu) menu.open = false;
      if (allFiles) {
        allFiles = false;
        savedAllFilesFilter = false;
        render();
      }
    });

    overlay.querySelector('#fb-menu-filter-all')?.addEventListener('click', () => {
      if (menu) menu.open = false;
      if (!allFiles) {
        allFiles = true;
        savedAllFilesFilter = true;
        render();
      }
    });

    // Wire folder and file row clicks
    overlay.querySelectorAll('.fb-row[data-path]').forEach(el => {
      el.addEventListener('click', () => {
        const path = (el as HTMLElement).dataset.path;
        if (!path) return;
        const isFile = (el as HTMLElement).dataset.isFile === 'true';

        if (isFile) {
          onSelect(path);
          closeOverlay(true);
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
          </div>
        </header>
        <div class="fb-breadcrumbs-wrap">
          <nav class="fb-breadcrumbs" id="fb-breadcrumbs" aria-label="Breadcrumb">
            ${renderBreadcrumbsHtml(path, t('fb_internal_storage', 'Internal storage'))}
          </nav>
        </div>
        <div class="fb-loading">
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
      </div>
    `;

    const bc = overlay.querySelector('#fb-breadcrumbs') as HTMLElement | null;
    if (bc) bc.scrollLeft = bc.scrollWidth;

    overlay.querySelector('#fb-back')?.addEventListener('click', () => {
      history.back();
    });

    try {
      const result = await exec(`find ${shellEscape(path)} -mindepth 1 -maxdepth 1 -exec stat -c '%F|%s|%Y|%n' {} + 2>/dev/null | head -300`);
      const stdout = (result.stdout || '').trim();
      if (stdout) {
        entries = stdout.split('\n').filter(Boolean).map(line => {
          const parts = line.split('|');
          const p0 = parts[0];
          const p1 = parts[1];
          const p2 = parts[2];
          if (parts.length >= 4 && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
            const isFolder = p0.includes('directory');
            const size = parseInt(p1, 10) || 0;
            const mtime = parseInt(p2, 10) || 0;
            const filePath = parts.slice(3).join('|');
            const name = filePath.split('/').pop() || '';
            return { name, isFolder, path: filePath, size, mtime };
          }
          return null;
        }).filter((e): e is FsEntry => e !== null && e.name !== '.' && e.name !== '..');
      }
    } catch {
      // fallback below
    }

    if (entries.length === 0) {
      try {
        const result = await exec(`ls -1p ${shellEscape(path)} 2>/dev/null | head -300`);
        const stdout = result.stdout || '';
        entries = stdout.split('\n').filter(Boolean).map((line: string) => ({
          name: line.replace(/\/$/, ''),
          isFolder: line.endsWith('/') && line !== '../',
          path: path.replace(/\/$/, '') + '/' + line.replace(/\/$/, ''),
          size: 0,
          mtime: 0
        })).filter((e: FsEntry) => e.name !== '.' && e.name !== '..');
      } catch (e) {
        console.warn('Directory listing failed:', e);
        entries = [];
      }
    }

    render();
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('subpage-overlay--open'));
  document.documentElement.style.overflow = 'hidden';
  window.isOverlayOpen = true;
  history.pushState({ subpage: 'file-browser', path: currentPath }, '');
  window.addEventListener('popstate', onPopState);

  await loadDir(currentPath, false);
}


