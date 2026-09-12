export function wireTopBarScroll() {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;
  window.addEventListener('scroll', () => topBar.classList.toggle('app-top-bar--scrolled', window.scrollY > 0));
}

const homeCallbacks: (() => void)[] = [];
export function onHomeShow(cb: () => void) { homeCallbacks.push(cb); }

export function wireNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const indicator = document.getElementById('nav-indicator')!;
  const pageIds = ['home-page', 'tools-page', 'control-page', 'settings-page'];
  const pages = pageIds.map(id => document.getElementById(id)!).filter(Boolean);
  let exitStatePushed = false;
  const loadedMWC = new Set<string>();
  let currentActiveIndex = -1;

  function reposition(tab: HTMLElement) {
    indicator.style.left = tab.offsetLeft + 'px';
    indicator.style.width = tab.offsetWidth + 'px';
  }

  function getCurrentPage(): string {
    return document.querySelector('.nav-tab--active')?.getAttribute('data-page') || 'home-page';
  }

  async function loadPageMWC(pageId: string) {
    if (loadedMWC.has(pageId)) return;
    loadedMWC.add(pageId);
    if (pageId === 'tools-page') await import('./material-tools.js');
    else if (pageId === 'control-page') await import('./material-control.js');
    else if (pageId === 'settings-page') {
      await import('./material-settings.js');
      const { initThemeUI } = await import('./theme.js');
      await initThemeUI().catch(() => {});
    }
  }

  async function activateTab(tab: HTMLElement) {
    const pageId = tab.dataset.page || '';
    const nextIndex = pageIds.indexOf(pageId);
    if (nextIndex === -1) return;
    if (nextIndex === currentActiveIndex && tab.classList.contains('nav-tab--active')) {
      return;
    }

    const prevIndex = currentActiveIndex;
    currentActiveIndex = nextIndex;

    const mwcPromise = loadPageMWC(pageId);

    document.querySelector('.nav-tab--active')?.classList.remove('nav-tab--active');
    tab.classList.add('nav-tab--active');
    reposition(tab);

    let animClass = '';
    if (prevIndex !== -1 && prevIndex !== nextIndex) {
      animClass = nextIndex > prevIndex ? 'page-enter-forward' : 'page-enter-backward';
    } else if (prevIndex === -1) {
      animClass = 'page-enter-initial';
    }

    pages.forEach(el => {
      if (el.id === pageId) {
        el.classList.remove('page-enter-forward', 'page-enter-backward', 'page-enter-initial');
        if (animClass) {
          void el.offsetWidth;
          el.classList.add(animClass);
        }
        el.hidden = false;
      } else {
        el.hidden = true;
        el.classList.remove('page-enter-forward', 'page-enter-backward', 'page-enter-initial');
      }
    });

    if (prevIndex !== -1 && prevIndex !== nextIndex) {
      window.scrollTo(0, 0);
    }

    if (pageId === 'home-page') homeCallbacks.forEach(cb => cb());
    if (pageId !== 'home-page' && !exitStatePushed) { history.pushState(null, ''); exitStatePushed = true; }

    await mwcPromise;
  }

  window.addEventListener('popstate', () => {
    const dialog = document.querySelector('md-dialog[open]');
    if (dialog) { (dialog as any).close(); return; }
    if (window.isOverlayOpen) return;
    exitStatePushed = false;
    if (getCurrentPage() === 'home-page') { window.close(); }
    else { document.querySelector('[data-page="home-page"]')?.dispatchEvent(new Event('click')); }
  });

  navTabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab as HTMLElement)));

  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    if (active) reposition(active);
  });

  requestAnimationFrame(() => {
    const homeTab = document.querySelector('[data-page="home-page"]') as HTMLElement | null;
    if (homeTab) activateTab(homeTab);
  });
}
