import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { showToast } from './toast.js';
import type { MdSwitch } from '@material/web/switch/switch.js';
import { installKeybox } from './keybox-install.js';


export interface KeyboxLocalOptions {
  onInstalled?: () => void;
  onValueChange?: (hasValue: boolean) => void;
}

export interface KeyboxLocalHandle {
  apply(): Promise<boolean>;
}

export async function mountLocalKeyboxForm(
  container: HTMLElement,
  options: KeyboxLocalOptions = {},
): Promise<KeyboxLocalHandle> {
  const [existingVal, privateVal] = await Promise.all([
    cfgGet('keybox_custom_value', '').catch(() => ''),
    cfgGet('keybox_private', '').catch(() => ''),
  ]);

  let selectedFilePath = existingVal || '';
  let urlInputEl: HTMLInputElement | null = null;
  let fileSubtitleEl: HTMLElement | null = null;
  let fileIconEl: HTMLElement | null = null;

  const updateFileUI = (val: string) => {
    if (fileSubtitleEl) {
      if (val) {
        fileSubtitleEl.textContent = val.split('/').pop() || val;
        fileSubtitleEl.classList.add('kb-file-subtitle--active');
      } else {
        fileSubtitleEl.textContent = t('custom_kb_file_desc', 'Select a keybox XML file from your device');
        fileSubtitleEl.classList.remove('kb-file-subtitle--active');
      }
    }
    if (fileIconEl) {
      fileIconEl.textContent = val ? 'vpn_key' : 'upload_file';
    }
  };

  container.innerHTML = `
    <div class="list-item list-item--first kb-file-row" id="kb-file-row">
      <div class="li-icon"><md-icon id="kb-file-icon" aria-hidden="true">${selectedFilePath ? 'vpn_key' : 'upload_file'}</md-icon></div>
      <div class="list-item-content">
        <div class="toggle-text">${escapeHtml(t('custom_kb_file', 'Import File'))}</div>
        <span class="supporting-text kb-file-subtitle${selectedFilePath ? ' kb-file-subtitle--active' : ''}" id="kb-file-subtitle">
          ${selectedFilePath ? escapeHtml(selectedFilePath.split('/').pop() || '') : escapeHtml(t('custom_kb_file_desc', 'Select a keybox XML file from your device'))}
        </span>
      </div>
      <div class="spacer"></div>
      <md-filled-tonal-button id="kb-browse-btn" class="kb-browse-btn">
        <md-icon slot="icon" aria-hidden="true">folder_open</md-icon>
        ${escapeHtml(t('custom_kb_browse', 'Browse Files'))}
      </md-filled-tonal-button>
      <md-ripple></md-ripple>
    </div>

    <div class="list-item list-item--middle kb-url-card">
      <div class="kb-url-row">
        <div class="li-icon"><md-icon aria-hidden="true">link</md-icon></div>
        <div class="list-item-content">
          <div class="toggle-text">${escapeHtml(t('custom_kb_url', 'URL or Path'))}</div>
          <span class="supporting-text">${escapeHtml(t('custom_kb_desc', 'Paste a download URL or enter a device path'))}</span>
        </div>
      </div>
      <div class="subpage-text-input-wrap">
        <input
          type="text"
          id="kb-url-input"
          class="subpage-full-input"
          placeholder="${escapeHtml(t('kb_url_placeholder', 'https://example.com/keybox.xml or /sdcard/keybox.xml'))}"
          value=""
          aria-label="${escapeHtml(t('custom_kb_url', 'URL or Path'))}"
        />
        <md-icon-button id="kb-paste-btn" aria-label="${escapeHtml(t('kb_paste_aria', 'Paste from clipboard'))}">
          <md-icon aria-hidden="true">content_paste</md-icon>
        </md-icon-button>
      </div>
    </div>

    <div class="list-item list-item--toggle list-item--last" id="kb-private-row">
      <div class="li-icon"><md-icon aria-hidden="true">lock</md-icon></div>
      <div class="list-item-content">
        <div class="toggle-text">${escapeHtml(t('custom_kb_private_toggle', 'Private Keybox'))}</div>
        <span class="supporting-text">${escapeHtml(t('custom_kb_private_desc', 'Hide certificate subject and serial in keybox information'))}</span>
      </div>
      <md-switch icons id="kb-private-switch" ${privateVal === 'true' ? 'selected' : ''} aria-label="${escapeHtml(t('custom_kb_private_toggle', 'Private Keybox'))}"></md-switch>
      <md-ripple></md-ripple>
    </div>
  `;

  fileSubtitleEl = container.querySelector('#kb-file-subtitle');
  fileIconEl = container.querySelector('#kb-file-icon');
  urlInputEl = container.querySelector('#kb-url-input');
  // Set the value as a property, never as an interpolated attribute.
  if (urlInputEl) urlInputEl.value = selectedFilePath;

  const browseBtn = container.querySelector('#kb-browse-btn');
  const fileRow = container.querySelector('#kb-file-row');
  const pasteBtn = container.querySelector('#kb-paste-btn');
  const privateSwitch = container.querySelector('#kb-private-switch') as MdSwitch | null;
  const privateRow = container.querySelector('#kb-private-row');
  const hasValue = () => Boolean(urlInputEl?.value.trim() || selectedFilePath.trim());

  const onPick = () => {
    void import('./file-browser.js').then(({ openFileBrowser }) => {
      openFileBrowser((filePath: string) => {
        selectedFilePath = filePath;
        updateFileUI(filePath);
        if (urlInputEl) urlInputEl.value = filePath;
        options.onValueChange?.(hasValue());
      }, {
        title: t('fb_internal_storage', 'Internal storage'),
      });
    });
  };

  fileRow?.addEventListener('click', onPick);
  browseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick();
  });

  urlInputEl?.addEventListener('input', () => {
    selectedFilePath = urlInputEl?.value.trim() || '';
    updateFileUI(selectedFilePath);
    options.onValueChange?.(hasValue());
  });

  pasteBtn?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && urlInputEl) {
        urlInputEl.value = text.trim();
        selectedFilePath = text.trim();
        updateFileUI(selectedFilePath);
        options.onValueChange?.(hasValue());
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  });

  const setPrivate = () => {
    cfgSet('keybox_private', privateSwitch?.selected ? 'true' : '');
  };
  privateSwitch?.addEventListener('change', setPrivate);
  privateRow?.addEventListener('click', (e) => {
    if (e.composedPath().some(node => node instanceof Element && node.localName === 'md-switch')) return;
    if (privateSwitch) privateSwitch.selected = !privateSwitch.selected;
    setPrivate();
  });

  options.onValueChange?.(hasValue());

  return {
    async apply(): Promise<boolean> {
      const text = urlInputEl?.value.trim() || selectedFilePath.trim();
      if (!text) {
        showToast(t('toast_enter_url', 'Enter a URL or device path'), { icon: 'error', type: 'error', autoCloseDelay: 2500 });
        return false;
      }

      return installKeybox({
        text,
        privateKeybox: !!privateSwitch?.selected,
        onInstalled: options.onInstalled,
      });
    },
  };
}


