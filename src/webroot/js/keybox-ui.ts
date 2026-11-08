import { t } from './i18n.js';
import { openSubPage } from './subpage.js';
import { mountLocalKeyboxForm, type KeyboxLocalHandle } from './keybox-local-ui.js';
import { wireRowActivation } from './utils.js';


export function wireKeybox() {
  const btn = document.getElementById('keybox-btn');
  if (!btn) return;
  wireRowActivation(btn, () => { void openKeyboxPage(); });
}

export async function openKeyboxPage() {
  let local: KeyboxLocalHandle | null = null;
  let page: { overlay: HTMLElement; close: () => void } | null = null;

  page = await openSubPage({
    id: 'keybox',
    title: t('menu_keybox', 'Keybox'),
    description: t('menu_keybox_desc', 'Choose a Specter keybox or use a custom source.'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-page',
            render: (container) => {
              container.className = 'kb-hub';
              container.parentElement?.classList.add('kb-page-container');
              container.innerHTML = `
                <h2 class="list-title">${t('kb_remote_section', 'Specter source')}</h2>
                <sp-settings-section id="kb-remote-section"></sp-settings-section>

                <h2 class="list-title">${t('kb_local_section', 'Custom source')}</h2>
                <sp-settings-section id="kb-local-content"></sp-settings-section>
                <md-filled-button id="kb-local-apply" class="kb-install-btn" disabled>
                  <md-icon slot="icon" aria-hidden="true">check</md-icon>
                  ${t('kb_catalog_install', 'Install')}
                </md-filled-button>
              `;

              const openRemote = () => {
                void import('./keybox-catalog-ui.js').then(m => m.openKeyboxCatalogPage());
              };
              const remoteRow = document.createElement('sp-settings-row');
              remoteRow.id = 'kb-remote-open';
              remoteRow.setAttribute('variant', 'navigation');
              remoteRow.setAttribute('headline', t('kb_specter_keyboxes', 'Specter keyboxes'));
              remoteRow.setAttribute('supporting-text', t('menu_import_keybox_desc', 'Browse available keyboxes and install one'));
              const remoteIcon = document.createElement('md-icon');
              remoteIcon.setAttribute('slot', 'icon');
              remoteIcon.setAttribute('aria-hidden', 'true');
              remoteIcon.textContent = 'cloud_download';
              remoteRow.append(remoteIcon);
              remoteRow.addEventListener('sp-activate', openRemote);
              container.querySelector('#kb-remote-section')?.append(remoteRow);
            },
          },
        ],
      },
    ],
  });

  const localContent = page.overlay.querySelector('#kb-local-content') as HTMLElement;
  const localApply = page.overlay.querySelector('#kb-local-apply') as HTMLButtonElement;

  local = await mountLocalKeyboxForm(localContent, {
    onInstalled: () => page?.close(),
    onValueChange: (hasValue) => {
      if (localApply) localApply.disabled = !hasValue;
    },
  });

  localApply?.addEventListener('click', async () => {
    if (!local || !localApply) return;
    const originalContent = localApply.innerHTML;
    localApply.disabled = true;
    localApply.classList.add('kb-install-btn--busy');
    localApply.innerHTML = `
      <md-icon slot="icon" aria-hidden="true">progress_activity</md-icon>
      ${t('kb_installing_btn', 'Installing…')}
    `;
    try {
      await local.apply();
    } finally {
      if (localApply) {
        localApply.innerHTML = originalContent;
        localApply.classList.remove('kb-install-btn--busy');
        localApply.disabled = false;
      }
    }
  });
}
