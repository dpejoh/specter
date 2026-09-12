export function wireTopBarScroll() {
  const topBar = document.getElementById('top-bar');
  if (!topBar) return;
  window.addEventListener('scroll', () => topBar.classList.toggle('app-top-bar--scrolled', window.scrollY > 0));
}

const homeCallbacks: (() => void)[] = [];
export function onHomeShow(cb: () => void) { homeCallbacks.push(cb); }

export function wireNavigation() {
  const navTabs = Array.from(document.querySelectorAll('.nav-tab')) as HTMLElement[];
  const indicator = document.getElementById('nav-indicator')!;
  const track = document.getElementById('pages')!;
  const pageIds = ['home-page', 'tools-page', 'control-page', 'settings-page'];
  const pages = pageIds.map(id => document.getElementById(id)!).filter(Boolean);
  let exitStatePushed = false;
  const loadedMWC = new Set<string>();
  let currentActiveIndex = 0;
  let animTimer: any = null;

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

  function setTrackPosition(index: number, smooth: boolean = true, offsetPx: number = 0) {
    const dirSign = isRTL() ? 1 : -1;
    const screenW = track.offsetWidth || window.innerWidth || 1;
    const basePct = dirSign * index * 100;
    const deltaPct = (offsetPx / screenW) * 100;
    const totalPct = basePct + deltaPct;

    if (smooth) {
      track.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    } else {
      track.style.transition = 'none';
    }
    track.style.transform = `translate3d(${totalPct}%, 0, 0)`;
  }

  async function activateTabByIndex(nextIndex: number, smooth: boolean = true) {
    if (nextIndex < 0 || nextIndex >= pageIds.length) return;
    const tab = navTabs[nextIndex];
    if (!tab) return;
    const pageId = pageIds[nextIndex];

    const prevIndex = currentActiveIndex;
    currentActiveIndex = nextIndex;

    const mwcPromise = loadPageMWC(pageId);

    document.querySelector('.nav-tab--active')?.classList.remove('nav-tab--active');
    tab.classList.add('nav-tab--active');

    // Unsuppress all pages during movement
    updatePageSuppression(nextIndex, true);

    indicator.style.transition = smooth ? '' : 'none';
    reposition(tab);

    if (animTimer) {
      clearTimeout(animTimer);
      animTimer = null;
    }

    setTrackPosition(nextIndex, smooth);

    if (smooth && prevIndex !== nextIndex) {
      window.scrollTo(0, 0);
    }

    if (smooth) {
      animTimer = window.setTimeout(() => {
        updatePageSuppression(nextIndex, false);
        animTimer = null;
      }, 330);
    } else {
      updatePageSuppression(nextIndex, false);
    }

    if (pageId === 'home-page') homeCallbacks.forEach(cb => cb());
    if (pageId !== 'home-page' && !exitStatePushed) {
      history.pushState(null, '');
      exitStatePushed = true;
    }

    await mwcPromise;
  }

  async function activateTab(tab: HTMLElement) {
    const pageId = tab.dataset.page || '';
    const nextIndex = pageIds.indexOf(pageId);
    if (nextIndex === -1) return;
    if (nextIndex === currentActiveIndex && tab.classList.contains('nav-tab--active')) {
      return;
    }
    await activateTabByIndex(nextIndex, true);
  }

  // Real-time touch swipe gesture tracking
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let touchIntent: 'none' | 'pending' | 'drag' | 'scroll' = 'none';

  document.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    if (window.isOverlayOpen) return;
    if (document.querySelector('md-dialog[open]')) return;
    const target = e.target;
    if (target instanceof Element && target.closest('input, select, textarea, md-slider, pre, code, .dialog-blur-backdrop')) {
      return;
    }

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    touchIntent = 'pending';

    // Unsuppress adjacent pages so they are rendered and visible during drag
    updatePageSuppression(currentActiveIndex, true);
    if (currentActiveIndex + 1 < pageIds.length) loadPageMWC(pageIds[currentActiveIndex + 1]);
    if (currentActiveIndex - 1 >= 0) loadPageMWC(pageIds[currentActiveIndex - 1]);
  }, { passive: true });

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (touchIntent === 'none' || touchIntent === 'scroll') return;
    if (e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;

    if (touchIntent === 'pending') {
      if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) {
        touchIntent = 'scroll';
        updatePageSuppression(currentActiveIndex, false);
        return;
      }
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        touchIntent = 'drag';
      }
    }

    if (touchIntent === 'drag') {
      if (e.cancelable) e.preventDefault();

      let effectiveDx = dx;
      const rtl = isRTL();
      const atStart = rtl ? currentActiveIndex === pageIds.length - 1 : currentActiveIndex === 0;
      const atEnd = rtl ? currentActiveIndex === 0 : currentActiveIndex === pageIds.length - 1;

      // Rubber band resistance past edges
      if ((effectiveDx > 0 && atStart) || (effectiveDx < 0 && atEnd)) {
        effectiveDx = effectiveDx * 0.35;
      }

      setTrackPosition(currentActiveIndex, false, effectiveDx);

      // Update bottom nav indicator in real time
      const screenW = track.offsetWidth || window.innerWidth || 1;
      const dragRatio = rtl ? effectiveDx / screenW : -effectiveDx / screenW;
      const targetIdx = dragRatio > 0 ? currentActiveIndex + 1 : currentActiveIndex - 1;
      if (targetIdx >= 0 && targetIdx < navTabs.length) {
        setIndicatorProgress(currentActiveIndex, targetIdx, Math.min(1, Math.max(0, Math.abs(dragRatio))));
      }
    }
  }, { passive: false });

  function onTouchEndOrCancel(e: TouchEvent) {
    if (touchIntent !== 'drag') {
      if (touchIntent === 'pending') {
        updatePageSuppression(currentActiveIndex, false);
      }
      touchIntent = 'none';
      return;
    }

    touchIntent = 'none';
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dt = Date.now() - startTime;
    const screenW = track.offsetWidth || window.innerWidth || 1;
    const rtl = isRTL();

    const moveNext = rtl ? dx > 0 : dx < 0;
    const distance = Math.abs(dx);
    const velocity = distance / Math.max(dt, 1);

    // Threshold: moved > 22% of screen width OR flick velocity (> 0.45 px/ms)
    let nextIdx = currentActiveIndex;
    if (distance > screenW * 0.22 || velocity > 0.45) {
      if (moveNext && currentActiveIndex + 1 < pageIds.length) {
        nextIdx = currentActiveIndex + 1;
      } else if (!moveNext && currentActiveIndex - 1 >= 0) {
        nextIdx = currentActiveIndex - 1;
      }
    }

    activateTabByIndex(nextIdx, true);
  }

  document.addEventListener('touchend', onTouchEndOrCancel, { passive: true });
  document.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true });

  window.addEventListener('popstate', () => {
    const dialog = document.querySelector('md-dialog[open]');
    if (dialog) { (dialog as any).close(); return; }
    if (window.isOverlayOpen) return;
    exitStatePushed = false;
    if (getCurrentPage() === 'home-page') { window.close(); }
    else { activateTabByIndex(0, true); }
  });

  navTabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab as HTMLElement)));

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
