export interface PullToRefreshOptions {
  scroller: HTMLElement;
  indicator: HTMLElement;
  arrow: HTMLElement;
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  resistance?: number;
}

/**
 * Wire the touch/pointer pull gesture used by the app-list overlays.
 * Returns a cleanup function so the overlay can detach its listeners when it
 * closes, instead of leaving them on a detached list element.
 */
export function setupPullToRefresh(options: PullToRefreshOptions): () => void {
  const {
    scroller,
    indicator,
    arrow,
    onRefresh,
    threshold = 80,
    maxPull = 200,
    resistance = 0.5,
  } = options;

  let startY = 0;
  let pulling = false;
  let triggered = false;

  function setIndicatorPull(pull: number) {
    indicator.style.transform = `translateY(${-threshold + pull}px)`;
  }

  function resetIndicator() {
    indicator.style.transform = '';
    indicator.style.opacity = '0';
  }

  function doEnd() {
    pulling = false;
    indicator.classList.remove('ptr-dragging');

    const m = (indicator.style.transform || '').match(/translateY\(([-\d.]+)px\)/);
    const currentY = m ? parseFloat(m[1] ?? '') : -threshold;
    const pull = currentY + threshold;

    if (pull >= threshold && !triggered) {
      triggered = true;
      arrow.style.display = 'none';
      indicator.style.transform = 'translateY(0px)';
      indicator.style.opacity = '1';
      onRefresh().then(() => {
        arrow.style.display = '';
        resetIndicator();
        triggered = false;
      });
    } else {
      resetIndicator();
      arrow.style.transform = '';
    }
  }

  function doCancel() {
    pulling = false;
    indicator.classList.remove('ptr-dragging');
    resetIndicator();
    arrow.style.transform = '';
  }

  const isTouch = 'ontouchstart' in window;

  const onTouchStart = (e: TouchEvent) => {
    if (scroller.scrollTop > 0 || triggered || e.touches.length !== 1) return;
    startY = e.touches[0]!.clientY;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const dy = e.touches[0]!.clientY - startY;
    if (!pulling) {
      if (dy > 0 && scroller.scrollTop === 0) {
        pulling = true;
        indicator.classList.add('ptr-dragging');
        e.preventDefault();
      }
      return;
    }
    if (dy < 0) {
      doCancel();
      return;
    }
    e.preventDefault();
    const pull = Math.min(dy * resistance, maxPull);
    const pct = Math.min(pull / threshold, 1);

    indicator.style.opacity = String(pct);
    setIndicatorPull(pull);
    arrow.style.transform = `rotate(${pct * 360}deg)`;
  };
  const onTouchEnd = () => { doEnd(); };

  const onPointerDown = (e: PointerEvent) => {
    if (isTouch) return;
    if (scroller.scrollTop > 0 || triggered) return;
    startY = e.clientY;
    pulling = true;
    indicator.classList.add('ptr-dragging');
    scroller.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pulling || isTouch) return;
    const dy = e.clientY - startY;
    if (dy < 0) {
      doCancel();
      return;
    }
    const pull = Math.min(dy * resistance, maxPull);
    const pct = Math.min(pull / threshold, 1);

    indicator.style.opacity = String(pct);
    setIndicatorPull(pull);
    arrow.style.transform = `rotate(${pct * 360}deg)`;
  };
  const onPointerEnd = () => { if (!isTouch) doEnd(); };
  const onPointerCancel = () => { if (!isTouch) doCancel(); };

  if (isTouch) {
    scroller.addEventListener('touchstart', onTouchStart, { passive: false });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', doCancel);
  } else {
    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerEnd);
    scroller.addEventListener('pointercancel', onPointerCancel);
  }

  return () => {
    if (isTouch) {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', doCancel);
    } else {
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerEnd);
      scroller.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}
