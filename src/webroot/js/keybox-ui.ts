import { getTranslation } from './i18n.js';
import { openSubPage } from './subpage.js';
import { mountKeyboxCatalog, type KeyboxCatalogHandle } from './keybox-catalog-ui.js';
import { mountLocalKeyboxForm, type KeyboxLocalHandle } from './keybox-local-ui.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function wireKeybox() {
  const btn = document.getElementById('keybox-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    void openKeyboxPage();
  });
}

export async function openKeyboxPage() {
  let source: 'remote' | 'local' = 'remote';
  let refreshButton: HTMLElement | null = null;
  let fab: (HTMLElement & { label: string; disabled: boolean }) | null = null;
  let catalog: KeyboxCatalogHandle | null = null;
  let local: KeyboxLocalHandle | null = null;
  let page: { overlay: HTMLElement; close: () => void } | null = null;

  const applySource = () => {
    if (!page) return;
    const remotePane = page.overlay.querySelector('#kb-remote-pane') as HTMLElement | null;
    const localPane = page.overlay.querySelector('#kb-local-pane') as HTMLElement | null;
    if (remotePane) remotePane.hidden = source !== 'remote';
    if (localPane) localPane.hidden = source !== 'local';
    if (refreshButton) refreshButton.hidden = source !== 'remote';
    if (fab) {
      fab.label = source === 'remote'
        ? t('kb_catalog_install', 'Install')
        : t('custom_kb_apply', 'Apply');
      fab.disabled = source === 'remote' ? !(catalog?.canInstall() ?? false) : false;
    }
  };

  page = await openSubPage({
    id: 'keybox',
    title: t('menu_keybox', 'Keybox'),
    description: t('menu_keybox_desc', 'Choose a remote keybox or apply a local one.'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'kb-page',
            render: (container) => {
              container.className = 'kb-page';
              container.innerHTML = `
                <div class="kb-source-switch">
                  <md-outlined-segmented-button-set id="kb-source-set">
                    <md-outlined-segmented-button value="remote" label="${t('kb_source_remote', 'Remote')}" selected></md-outlined-segmented-button>
                    <md-outlined-segmented-button value="local" label="${t('kb_source_local', 'Local')}"></md-outlined-segmented-button>
                  </md-outlined-segmented-button-set>
                </div>
                <div id="kb-remote-pane">
                  <div id="kb-remote-content"></div>
                </div>
                <div id="kb-local-pane" hidden>
                  <div class="list-container" id="kb-local-content"></div>
                </div>
              `;

              const sourceSet = container.querySelector('#kb-source-set');
              const sourceButtons = sourceSet
                ? [...sourceSet.querySelectorAll<HTMLElement & { selected: boolean }>('md-outlined-segmented-button')]
                : [];
              sourceButtons.forEach((button) => {
                button.addEventListener('click', () => {
                  source = (button.getAttribute('value') as 'remote' | 'local') || 'remote';
                  sourceButtons.forEach(candidate => {
                    const isSelected = candidate === button;
                    candidate.selected = isSelected;
                    candidate.toggleAttribute('selected', isSelected);
                  });
                  applySource();
                });
              });
            },
          },
        ],
      },
    ],
    headerAction: (container) => {
      container.innerHTML = `
        <md-icon-button id="kb-refresh" aria-label="${t('kb_refresh_btn', 'Refresh')}">
          <md-icon aria-hidden="true">refresh</md-icon>
        </md-icon-button>
      `;
      refreshButton = container.querySelector('#kb-refresh');
    },
    fab: (container) => {
      container.innerHTML = `
        <md-fab variant="primary" class="subpage-fab" id="kb-fab" label="${t('kb_catalog_install', 'Install')}" disabled>
          <md-icon slot="icon" aria-hidden="true">download</md-icon>
        </md-fab>
      `;
      fab = container.querySelector('#kb-fab');
      fab?.addEventListener('click', async () => {
        if (source === 'remote') {
          await catalog?.install();
          return;
        }
        if (!local || !fab) return;
        fab.disabled = true;
        try {
          await local.apply();
        } finally {
          if (fab) fab.disabled = false;
        }
      });
    },
  });

  const remoteContent = page.overlay.querySelector('#kb-remote-content') as HTMLElement;
  const localContent = page.overlay.querySelector('#kb-local-content') as HTMLElement;

  catalog = mountKeyboxCatalog(remoteContent, {
    refreshButton,
    onStateChange: () => applySource(),
    onInstalled: () => page?.close(),
  });
  local = await mountLocalKeyboxForm(localContent, {
    onInstalled: () => page?.close(),
  });

  applySource();
  void catalog.load();
}
