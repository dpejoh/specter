import type { PageId } from './page-loader.js';

export interface SwipeControllerOptions {
  navTabs: HTMLElement[];
  track: HTMLElement;
  pageIds: readonly PageId[];
  getCurrentIndex: () => number;
  isRTL: () => boolean;
  isPagePending: (pageId: PageId) => boolean;
  setPageLoading: (pageId: PageId, loading: boolean) => void;
  updatePageSuppression: (activeIdx: number, unsuppressAll?: boolean) => void;
  setTrackPosition: (index: number, smooth?: boolean, offsetPx?: number, viewportWidth?: number) => void;
  setIndicatorProgress: (currentIdx: number, targetIdx: number, progress: number) => void;
  activateIndex: (index: number, smooth: boolean) => void;
}

/** Wire the horizontal swipe gesture used by the bottom navigation. */
export function wireSwipeNavigation(options: SwipeControllerOptions): void {
  const {
    navTabs,
    track,
    pageIds,
    getCurrentIndex,
    isRTL,
    isPagePending,
    setPageLoading,
    updatePageSuppression,
    setTrackPosition,
    setIndicatorProgress,
    activateIndex,
  } = options;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let touchIntent: 'none' | 'pending' | 'drag' | 'scroll' = 'none';
  let swipeWidth = 0;
  let dragPagesVisible = false;

  document.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length !== 1 || !e.touches[0]) return;
    if (window.isOverlayOpen) return;
    if (document.querySelector('md-dialog[open]')) return;
    const target = e.target;
    if (target instanceof Element && target.closest('input, select, textarea, md-slider, pre, code')) {
      return;
    }

    const firstTouch = e.touches[0];
    startX = firstTouch.clientX;
    startY = firstTouch.clientY;
    startTime = Date.now();
    touchIntent = 'pending';
    swipeWidth = window.innerWidth || 1;
    dragPagesVisible = false;
    track.classList.add('is-swiping');
  }, { passive: true });

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (touchIntent === 'none' || touchIntent === 'scroll') return;
    if (e.touches.length !== 1 || !e.touches[0]) return;

    const moveTouch = e.touches[0];
    const currentX = moveTouch.clientX;
    const currentY = moveTouch.clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;

    if (touchIntent === 'pending') {
      if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) {
        touchIntent = 'scroll';
        return;
      }
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        touchIntent = 'drag';
      }
    }

    if (touchIntent === 'drag') {
      if (e.cancelable) e.preventDefault();

      const currentIndex = getCurrentIndex();
      if (!dragPagesVisible) {
        dragPagesVisible = true;
        // Only render the current page and its neighbors during a drag.
        updatePageSuppression(currentIndex, true);
        for (const id of [pageIds[currentIndex + 1], pageIds[currentIndex - 1]]) {
          if (id && isPagePending(id)) setPageLoading(id, true);
        }
      }

      let effectiveDx = dx;
      const rtl = isRTL();
      const atStart = rtl ? currentIndex === pageIds.length - 1 : currentIndex === 0;
      const atEnd = rtl ? currentIndex === 0 : currentIndex === pageIds.length - 1;

      // Rubber band resistance past the edges.
      if ((effectiveDx > 0 && atStart) || (effectiveDx < 0 && atEnd)) {
        effectiveDx = effectiveDx * 0.35;
      }

      setTrackPosition(currentIndex, false, effectiveDx, swipeWidth);

      const dragRatio = rtl ? effectiveDx / swipeWidth : -effectiveDx / swipeWidth;
      const targetIdx = dragRatio > 0 ? currentIndex + 1 : currentIndex - 1;
      if (targetIdx >= 0 && targetIdx < navTabs.length) {
        setIndicatorProgress(currentIndex, targetIdx, Math.min(1, Math.max(0, Math.abs(dragRatio))));
      }
    }
  }, { passive: false });

  /** Restore the track and indicator to the current page without activating. */
  function snapBack() {
    dragPagesVisible = false;
    const currentIndex = getCurrentIndex();
    updatePageSuppression(currentIndex, false);
    setTrackPosition(currentIndex, true);
    setIndicatorProgress(currentIndex, currentIndex, 0);
  }

  function onTouchEnd(e: TouchEvent) {
    track.classList.remove('is-swiping');
    if (touchIntent !== 'drag') {
      touchIntent = 'none';
      return;
    }

    touchIntent = 'none';
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dt = Date.now() - startTime;
    const screenW = swipeWidth || track.offsetWidth || window.innerWidth || 1;
    const rtl = isRTL();
    const currentIndex = getCurrentIndex();

    const moveNext = rtl ? dx > 0 : dx < 0;
    const distance = Math.abs(dx);
    const velocity = distance / Math.max(dt, 1);

    // A swipe needs either 22% of the screen or a fast flick.
    let nextIdx = currentIndex;
    if (distance > screenW * 0.22 || velocity > 0.45) {
      if (moveNext && currentIndex + 1 < pageIds.length) {
        nextIdx = currentIndex + 1;
      } else if (!moveNext && currentIndex - 1 >= 0) {
        nextIdx = currentIndex - 1;
      }
    }

    activateIndex(nextIdx, true);
  }

  function onTouchCancel() {
    track.classList.remove('is-swiping');
    if (touchIntent !== 'drag') {
      touchIntent = 'none';
      return;
    }

    // The OS interrupted the gesture, so never commit based on a partial drag.
    touchIntent = 'none';
    snapBack();
  }

  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { passive: true });
}
