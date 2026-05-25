export function wireTopBarScroll() {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;
  window.addEventListener('scroll', () => {
    topBar.classList.toggle('app-top-bar--scrolled', window.scrollY > 0);
  });
}

export function wireNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const indicator = document.getElementById('nav-indicator')!;
  const pageIds = ['home-page', 'tools-page', 'control-page', 'settings-page'];
  const pages = pageIds.map(id => document.getElementById(id)!).filter(Boolean);

  let lastClickTab: string | null = null;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let exitStatePushed = false;

  const loadedMWC = new Set<string>();

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
    switch (pageId) {
      case 'tools-page':
        await import('./material-tools.js');
        break;
      case 'control-page':
        await import('./material-control.js');
        break;
      case 'settings-page':
        await import('./material-settings.js');
        const { initThemeUI } = await import('./theme.js');
        await initThemeUI().catch(() => {});
        break;
    }
  }

  async function activateTab(tab: HTMLElement) {
    const pageId = tab.dataset.page || '';
    await loadPageMWC(pageId);

    const oldTab = document.querySelector('.nav-tab--active');
    if (oldTab && oldTab !== tab) {
      oldTab.classList.remove('nav-tab--active');
      oldTab.removeAttribute('aria-current');
      oldTab.querySelector('.nav-icon')?.classList.remove('nav-icon--filled');
    }
    tab.classList.add('nav-tab--active');
    tab.setAttribute('aria-current', 'page');
    tab.querySelector('.nav-icon')?.classList.add('nav-icon--filled');
    reposition(tab);
    pages.forEach((el) => { el.hidden = el.id !== pageId; });

    if (pageId !== 'home-page' && !exitStatePushed) {
      history.pushState(null, '');
      exitStatePushed = true;
    }
  }

  function navigateHome() {
    const homeTab = Array.from(navTabs).find(
      t => (t as HTMLElement).dataset.page === 'home-page'
    ) as HTMLElement | null;
    if (homeTab && !homeTab.classList.contains('nav-tab--active')) {
      activateTab(homeTab);
    }
  }

  window.addEventListener('popstate', () => {
    if ((window as any).isOverlayOpen) return;
    exitStatePushed = false;
    if (getCurrentPage() === 'home-page') {
      window.close();
    } else {
      navigateHome();
    }
  });

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const pageId = (tab as HTMLElement).dataset.page || '';
      if (lastClickTab === pageId) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        lastClickTab = null;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = null;
      } else {
        lastClickTab = pageId;
        activateTab(tab as HTMLElement);
        clickTimer = setTimeout(() => {
          lastClickTab = null;
          clickTimer = null;
        }, 400);
      }
    });
  });

  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    if (active) reposition(active);
  });

  requestAnimationFrame(() => {
    navigateHome();
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    if (active) reposition(active);
  });
}
