import { PAGE_IDS, isPageId, isPagePending, setPageLoading, schedulePageWork, type PageId } from './page-loader.js';
import { wireSwipeNavigation } from './swipe-controller.js';

export { onPageActivate } from './page-loader.js';

export function wireTopBarScroll() {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;
  window.addEventListener('scroll', () => {
    topBar.classList.toggle('app-top-bar--scrolled', window.scrollY > 0);
  }, { passive: true });
}

const homeCallbacks: (() => void)[] = [];
export function onHomeShow(cb: () => void) { homeCallbacks.push(cb); }

export function wireNavigation() {
  const navTabs = Array.from(document.querySelectorAll('.nav-tab')) as HTMLElement[];
  const indicator = document.getElementById('nav-indicator')!;
  const track = document.getElementById('pages')!;
  const pageIds = PAGE_IDS;
  const pages = pageIds.map(id => document.getElementById(id)!).filter(Boolean);
  let exitStatePushed = false;
  let currentActiveIndex = 0;
  let animTimer: any = null;
  let transitionFrame: number | null = null;
  let activationToken = 0;

  function isRTL(): boolean {
    return document.documentElement.getAttribute('dir') === 'rtl';
  }

  function reposition(tab: HTMLElement) {
    indicator.style.left = tab.offsetLeft + 'px';
    indicator.style.width = tab.offsetWidth + 'px';
  }

  function setIndicatorProgress(curIdx: number, targetIdx: number, progress: number) {
    const curTab = navTabs[curIdx];
    const tgtTab = navTabs[targetIdx];
    if (!curTab || !tgtTab) return;
    const left = curTab.offsetLeft + (tgtTab.offsetLeft - curTab.offsetLeft) * progress;
    const width = curTab.offsetWidth + (tgtTab.offsetWidth - curTab.offsetWidth) * progress;
    indicator.style.transition = 'none';
    indicator.style.left = left + 'px';
    indicator.style.width = width + 'px';
  }

  function getCurrentPage(): PageId {
    const active = document.querySelector('.nav-tab--active')?.getAttribute('data-page') || '';
    return isPageId(active) ? active : 'home-page';
  }

  function updatePageSuppression(activeIdx: number, unsuppressAll: boolean = false) {
    pages.forEach((page, idx) => {
      page.hidden = false;
      if (unsuppressAll || idx === activeIdx) {
        page.classList.remove('page--suppressed');
      } else {
        page.classList.add('page--suppressed');
      }
    });
  }

  function setTrackPosition(index: number, smooth: boolean = true, offsetPx: number = 0, viewportWidth: number = 0) {
    const dirSign = isRTL() ? 1 : -1;
    let totalPct = dirSign * index * 100;
    // A tab switch only needs the percentage; reading offsetWidth here would
    // force a full page layout before the navigation can paint.
    if (offsetPx !== 0) {
      const screenW = viewportWidth || track.offsetWidth || window.innerWidth || 1;
      totalPct += (offsetPx / screenW) * 100;
    }

    if (smooth) {
      track.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    } else {
      track.style.transition = 'none';
    }
    track.style.transform = `translate3d(${totalPct}%, 0, 0)`;
  }

  /** Start the page slide and the post-slide cleanup. */
  function beginTransition(nextIndex: number, smooth: boolean) {
    if (animTimer) {
      clearTimeout(animTimer);
      animTimer = null;
    }

    // Unsuppress pages only for the duration of the movement.
    updatePageSuppression(nextIndex, true);
    setTrackPosition(nextIndex, smooth);

    if (smooth) {
      animTimer = window.setTimeout(() => {
        updatePageSuppression(nextIndex, false);
        animTimer = null;
      }, 330);
    } else {
      updatePageSuppression(nextIndex, false);
    }
  }

  function scheduleHomeCallbacks() {
    window.setTimeout(() => {
      homeCallbacks.forEach(cb => cb());
    }, 0);
  }

  function activateTabByIndex(nextIndex: number, smooth: boolean = true) {
    if (nextIndex < 0 || nextIndex >= pageIds.length) return;
    const tab = navTabs[nextIndex];
    if (!tab) return;
    const pageId = pageIds[nextIndex];
    if (!pageId) return;

    const prevIndex = currentActiveIndex;
    currentActiveIndex = nextIndex;

    // Update the tab and indicator first. Page layout comes later, after the
    // navigation has had a frame to paint.
    document.querySelector('.nav-tab--active')?.classList.remove('nav-tab--active');
    tab.classList.add('nav-tab--active');
    navTabs.forEach(t => t.removeAttribute('aria-current'));
    tab.setAttribute('aria-current', 'page');
    indicator.style.transition = smooth ? '' : 'none';
    reposition(tab);

    if (isPagePending(pageId)) setPageLoading(pageId, true);

    if (pageId !== 'home-page' && !exitStatePushed) {
      history.pushState(null, '');
      exitStatePushed = true;
    }

    const token = ++activationToken;
    const start = () => {
      if (token !== activationToken) return;
      if (smooth && prevIndex !== nextIndex) window.scrollTo(0, 0);
      beginTransition(nextIndex, smooth);
      if (pageId === 'home-page') scheduleHomeCallbacks();
      else schedulePageWork(pageId, smooth);
    };

    if (!smooth) {
      start();
      return;
    }

    if (transitionFrame !== null) cancelAnimationFrame(transitionFrame);
    transitionFrame = requestAnimationFrame(() => {
      transitionFrame = null;
      // rAF runs before paint; the timer runs after that frame has been
      // presented, so the navigation feedback is visible before any layout.
      window.setTimeout(start, 0);
    });
  }

  function activateTab(tab: HTMLElement) {
    const pageId = tab.dataset.page || '';
    if (!isPageId(pageId)) return;
    const nextIndex = pageIds.indexOf(pageId);
    if (nextIndex === -1) return;
    if (nextIndex === currentActiveIndex && tab.classList.contains('nav-tab--active')) {
      return;
    }
    activateTabByIndex(nextIndex, true);
  }

  wireSwipeNavigation({
    navTabs,
    track,
    pageIds,
    getCurrentIndex: () => currentActiveIndex,
    isRTL,
    isPagePending,
    setPageLoading,
    updatePageSuppression,
    setTrackPosition,
    setIndicatorProgress,
    activateIndex: (index, smooth) => activateTabByIndex(index, smooth),
  });

  window.addEventListener('popstate', (event) => {
    const dialog = document.querySelector('md-dialog[open]');
    if (dialog) {
      // Back closes the topmost dialog only. Without this, every overlay's
      // popstate listener would also close the page underneath.
      event.stopImmediatePropagation();
      (dialog as any).close();
      return;
    }
    if (window.isOverlayOpen) return;
    exitStatePushed = false;
    if (getCurrentPage() === 'home-page') { window.close(); }
    else { activateTabByIndex(0, true); }
  });

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab as HTMLElement));
  });

  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-tab--active') as HTMLElement | null;
    if (active) reposition(active);
    setTrackPosition(currentActiveIndex, false);
  });

  requestAnimationFrame(() => {
    updatePageSuppression(0, false);
    setTrackPosition(0, false);
    const homeTab = document.querySelector('[data-page="home-page"]') as HTMLElement | null;
    if (homeTab) reposition(homeTab);
  });
}
