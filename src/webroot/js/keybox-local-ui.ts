import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
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

  container.replaceChildren();

  const fileRow = document.createElement('sp-settings-row');
  fileRow.id = 'kb-file-row';
  fileRow.className = 'kb-file-row';
  fileRow.setAttribute('variant', 'navigation');
  fileRow.setAttribute('headline', t('custom_kb_file', 'Import File'));
  const fileIcon = document.createElement('md-icon');
  fileIcon.id = 'kb-file-icon';
  fileIcon.setAttribute('slot', 'icon');
  fileIcon.setAttribute('aria-hidden', 'true');
  fileIcon.textContent = selectedFilePath ? 'vpn_key' : 'upload_file';
  fileRow.append(fileIcon);
  const fileSubtitle = document.createElement('span');
  fileSubtitle.id = 'kb-file-subtitle';
  fileSubtitle.setAttribute('slot', 'supporting');
  fileSubtitle.className = `kb-file-subtitle${selectedFilePath ? ' kb-file-subtitle--active' : ''}`;
  fileSubtitle.textContent = selectedFilePath
    ? (selectedFilePath.split('/').pop() || '')
    : t('custom_kb_file_desc', 'Select a keybox XML file from your device');
  fileRow.append(fileSubtitle);

  const urlRow = document.createElement('sp-settings-row');
  urlRow.className = 'kb-url-card';
  urlRow.setAttribute('variant', 'custom');
  urlRow.setAttribute('stacked', '');
  urlRow.setAttribute('headline', t('custom_kb_url', 'URL or Path'));
  urlRow.setAttribute('supporting-text', t('custom_kb_desc', 'Paste a download URL or enter a device path'));
  const urlIcon = document.createElement('md-icon');
  urlIcon.setAttribute('slot', 'icon');
  urlIcon.setAttribute('aria-hidden', 'true');
  urlIcon.textContent = 'link';
  urlRow.append(urlIcon);
  const urlWrap = document.createElement('div');
  urlWrap.className = 'subpage-text-input-wrap';
  urlWrap.setAttribute('slot', 'trailing');
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.id = 'kb-url-input';
  urlInput.className = 'subpage-full-input';
  urlInput.placeholder = t('kb_url_placeholder', 'https://example.com/keybox.xml or /sdcard/keybox.xml');
  urlInput.value = selectedFilePath;
  urlInput.setAttribute('aria-label', t('custom_kb_url', 'URL or Path'));
  const pasteBtn = document.createElement('md-icon-button');
  pasteBtn.id = 'kb-paste-btn';
  pasteBtn.setAttribute('aria-label', t('kb_paste_aria', 'Paste from clipboard'));
  pasteBtn.innerHTML = '<md-icon aria-hidden="true">content_paste</md-icon>';
  urlWrap.append(urlInput, pasteBtn);
  urlRow.append(urlWrap);

  const privateRow = document.createElement('sp-settings-row');
  privateRow.id = 'kb-private-row';
  privateRow.setAttribute('variant', 'toggle');
  privateRow.setAttribute('headline', t('custom_kb_private_toggle', 'Private Keybox'));
  privateRow.setAttribute('supporting-text', t('custom_kb_private_desc', 'Hide certificate subject and serial in keybox information'));
  const privateIcon = document.createElement('md-icon');
  privateIcon.setAttribute('slot', 'icon');
  privateIcon.setAttribute('aria-hidden', 'true');
  privateIcon.textContent = 'lock';
  privateRow.append(privateIcon);
  const privateSwitch = document.createElement('md-switch') as MdSwitch;
  privateSwitch.id = 'kb-private-switch';
  privateSwitch.setAttribute('slot', 'trailing');
  privateSwitch.setAttribute('icons', '');
  privateSwitch.setAttribute('aria-label', t('custom_kb_private_toggle', 'Private Keybox'));
  privateSwitch.selected = privateVal === 'true';
  privateRow.append(privateSwitch);

  container.append(fileRow, urlRow, privateRow);

  fileSubtitleEl = fileSubtitle;
  fileIconEl = fileIcon;
  urlInputEl = urlInput;
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

  fileRow.addEventListener('sp-activate', onPick);

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
  privateSwitch.addEventListener('change', setPrivate);

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


