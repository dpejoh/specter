import { t } from './i18n.js';
import { openSubPage } from './subpage.js';
import { row } from './ui-row.js';
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
                  ${row({
                    tag: 'button',
                    id: 'kb-remote-open',
                    icon: 'cloud_download',
                    title: t('kb_specter_keyboxes', 'Specter keyboxes'),
                    description: t('menu_import_keybox_desc', 'Browse available keyboxes and install one'),
                  })}
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
