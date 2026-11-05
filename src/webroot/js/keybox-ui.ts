import { t } from './i18n.js';
import { openSubPage } from './subpage.js';
import { mountLocalKeyboxForm, type KeyboxLocalHandle } from './keybox-local-ui.js';


export function wireKeybox() {
  const btn = document.getElementById('keybox-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    void openKeyboxPage();
  });
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
                <div class="list-container">
                  <button type="button" class="list-item" id="kb-remote-open">
                    <div class="li-icon"><md-icon aria-hidden="true">cloud_download</md-icon></div>
                    <div class="list-item-content">
                      <div class="toggle-text">${t('kb_specter_keyboxes', 'Specter keyboxes')}</div>
                      <span class="supporting-text">${t('menu_import_keybox_desc', 'Browse available keyboxes and install one')}</span>
                    </div>
                    <div class="spacer"></div>
                    <md-ripple></md-ripple>
                  </button>
                </div>

                <h2 class="list-title">${t('kb_local_section', 'Custom source')}</h2>
                <div class="list-container" id="kb-local-content"></div>
                <md-filled-button id="kb-local-apply" class="kb-install-btn" disabled>
                  <md-icon slot="icon" aria-hidden="true">check</md-icon>
                  ${t('kb_catalog_install', 'Install')}
                </md-filled-button>
              `;

              const remoteOpen = container.querySelector('#kb-remote-open') as HTMLElement | null;
              const openRemote = () => {
                void import('./keybox-catalog-ui.js').then(m => m.openKeyboxCatalogPage());
              };
              remoteOpen?.addEventListener('click', openRemote);
              remoteOpen?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openRemote();
                }
              });
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
    localApply.disabled = true;
    try {
      await local.apply();
    } finally {
      if (localApply) localApply.disabled = false;
    }
  });
}
