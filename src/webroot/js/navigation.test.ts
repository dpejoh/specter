import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onHomeShow, wireNavigation, wireTopBarScroll } from './navigation.js';

const pageLoader = vi.hoisted(() => ({
  PAGE_IDS: ['home-page', 'tools-page', 'control-page', 'settings-page'],
  isPageId: (value: string) => ['home-page', 'tools-page', 'control-page', 'settings-page'].includes(value),
  isPagePending: vi.fn((_pageId: string) => false),
  setPageLoading: vi.fn(),
  schedulePageWork: vi.fn(),
  onPageActivate: vi.fn(),
}));

vi.mock('./page-loader.js', () => pageLoader);

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

type ListenerRecord = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options: AddEventListenerOptions | boolean | undefined;
};

let listenerRecords: ListenerRecord[] = [];

function trackListeners(target: EventTarget): void {
  const original = target.addEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: AddEventListenerOptions | boolean,
    ) => {
      if (listener) listenerRecords.push({ target, type, listener, options });
      original(type, listener, options);
    },
  );
}

// The track transform is applied from a requestAnimationFrame callback, so a
// fixed sleep races it under load. Poll for the expected value instead; the
// assertions themselves are unchanged.
async function expectTransform(track: HTMLElement, expected: string): Promise<void> {
  const deadline = Date.now() + 1000;
  while (track.style.transform !== expected && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5));
  }
  expect(track.style.transform).toBe(expected);
}

function setupDom(): void {
  document.body.innerHTML = `
    <div id="top-bar"></div>
    <div class="nav-bar">
      <div id="nav-indicator"></div>
      <button class="nav-tab nav-tab--active" data-page="home-page"><span class="nav-label">Home</span></button>
      <button class="nav-tab" data-page="tools-page"><span class="nav-label">Tools</span></button>
      <button class="nav-tab" data-page="control-page"><span class="nav-label">Control</span></button>
      <button class="nav-tab" data-page="settings-page"><span class="nav-label">Settings</span></button>
    </div>
    <div id="pages">
      <section id="home-page"></section>
      <section id="tools-page" hidden></section>
      <section id="control-page" hidden></section>
      <section id="settings-page" hidden></section>
    </div>
  `;
}

function tab(pageId: string): HTMLElement {
  return document.querySelector(`[data-page="${pageId}"]`) as HTMLElement;
}

beforeEach(() => {
  setupDom();
  document.documentElement.removeAttribute('dir');
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  delete (window as unknown as Record<string, unknown>).isOverlayOpen;
  vi.clearAllMocks();
  pageLoader.isPagePending.mockReturnValue(false);

  listenerRecords = [];
  trackListeners(window);
  trackListeners(document);
});

afterEach(() => {
  for (const { target, type, listener, options } of listenerRecords) {
    target.removeEventListener(type, listener, options);
  }
  listenerRecords = [];
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).isOverlayOpen;
});

describe('wireNavigation directional animations', () => {
  it('applies directional track transforms when moving between tabs', async () => {
    wireNavigation();

    // Trigger rAF for initial load
    await frame();

    const track = document.getElementById('pages')!;
    const homePage = document.getElementById('home-page')!;
    const toolsPage = document.getElementById('tools-page')!;

    const homeTab = tab('home-page');
    const toolsTab = tab('tools-page');
    const controlTab = tab('control-page');
    const settingsTab = tab('settings-page');

    // Initially home-page is shown (index 0)
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');
    expect(homeTab.classList.contains('nav-tab--active')).toBe(true);

    // Switch Forward: Home (0) -> Tools (1)
    toolsTab.click();
    await expectTransform(track, 'translate3d(-100%, 0, 0)');
    expect(toolsTab.classList.contains('nav-tab--active')).toBe(true);

    // Switch Forward: Tools (1) -> Settings (3)
    settingsTab.click();
    await expectTransform(track, 'translate3d(-300%, 0, 0)');
    expect(settingsTab.classList.contains('nav-tab--active')).toBe(true);

    // Switch Backward: Settings (3) -> Control (2)
    controlTab.click();
    await expectTransform(track, 'translate3d(-200%, 0, 0)');
    expect(controlTab.classList.contains('nav-tab--active')).toBe(true);

    // Switch Backward: Control (2) -> Home (0)
    homeTab.click();
    await expectTransform(track, 'translate3d(0%, 0, 0)');
    expect(homeTab.classList.contains('nav-tab--active')).toBe(true);

    // Wait for transition to finish
    await new Promise(r => setTimeout(r, 350));
    expect(homePage.classList.contains('page--suppressed')).toBe(false);
    expect(toolsPage.classList.contains('page--suppressed')).toBe(true);

    // Clicking already active tab should not re-trigger or change
    homeTab.click();
    await new Promise(r => setTimeout(r, 20));
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');

    // Allow background dynamic imports to settle before test environment tears down
    await new Promise(r => setTimeout(r, 150));
  });

  it('supports real-time touch swipe navigation between tabs', async () => {
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    const toolsTab = tab('tools-page');

    // Simulate touch drag from Home to Tools (drag left)
    const touchStart = new TouchEvent('touchstart', {
      touches: [{ clientX: 300, clientY: 200 } as any],
    });
    document.dispatchEvent(touchStart);

    // Move horizontally by -100px
    const touchMove = new TouchEvent('touchmove', {
      cancelable: true,
      touches: [{ clientX: 200, clientY: 200 } as any],
    });
    document.dispatchEvent(touchMove);

    // In touchmove, track transform is updated in real time with offset
    expect(track.style.transition).toBe('none');
    expect(track.style.transform).toContain('translate3d');

    // Touch end past threshold
    const touchEnd = new TouchEvent('touchend', {
      changedTouches: [{ clientX: 100, clientY: 200 } as any],
    });
    document.dispatchEvent(touchEnd);

    await expectTransform(track, 'translate3d(-100%, 0, 0)');
    expect(toolsTab.classList.contains('nav-tab--active')).toBe(true);

    // Allow background dynamic imports to settle
    await new Promise(r => setTimeout(r, 150));
  });
});

describe('wireTopBarScroll', () => {
  it('toggles the scrolled class with the scroll position', () => {
    const topBar = document.getElementById('top-bar')!;
    wireTopBarScroll();

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 40 });
    window.dispatchEvent(new Event('scroll'));
    expect(topBar.classList.contains('app-top-bar--scrolled')).toBe(true);

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    window.dispatchEvent(new Event('scroll'));
    expect(topBar.classList.contains('app-top-bar--scrolled')).toBe(false);
  });

  it('does nothing when the top bar is absent', () => {
    document.getElementById('top-bar')!.remove();
    expect(() => wireTopBarScroll()).not.toThrow();

    const before = listenerRecords.length;
    window.dispatchEvent(new Event('scroll'));
    expect(listenerRecords.length).toBe(before);
  });
});

describe('navigation callbacks and page loading', () => {
  it('runs home callbacks and schedules page work for cold pages', async () => {
    const home = vi.fn();
    onHomeShow(home);
    wireNavigation();
    await frame();

    tab('tools-page').click();
    await frame();
    await tick();
    expect(pageLoader.schedulePageWork).toHaveBeenCalledWith('tools-page', true);
    expect(home).not.toHaveBeenCalled();

    tab('home-page').click();
    await frame();
    await tick();
    await tick();
    expect(home).toHaveBeenCalledTimes(1);
    expect(pageLoader.schedulePageWork).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state for a pending page', async () => {
    pageLoader.isPagePending.mockImplementation((pageId: string) => pageId === 'control-page');
    wireNavigation();
    await frame();

    tab('control-page').click();

    expect(pageLoader.isPagePending).toHaveBeenCalledWith('control-page');
    expect(pageLoader.setPageLoading).toHaveBeenCalledWith('control-page', true);
  });
});

describe('direction and layout', () => {
  it('uses positive track positions in RTL', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    tab('tools-page').click();
    await expectTransform(track, 'translate3d(100%, 0, 0)');

    tab('control-page').click();
    await expectTransform(track, 'translate3d(200%, 0, 0)');

    document.documentElement.removeAttribute('dir');
    tab('home-page').click();
    await expectTransform(track, 'translate3d(0%, 0, 0)');
  });

  it('repositions the indicator when the window resizes', async () => {
    const homeTab = tab('home-page');
    const toolsTab = tab('tools-page');
    const indicator = document.getElementById('nav-indicator')!;
    const track = document.getElementById('pages')!;
    Object.defineProperty(homeTab, 'offsetLeft', { configurable: true, value: 10 });
    Object.defineProperty(homeTab, 'offsetWidth', { configurable: true, value: 50 });
    Object.defineProperty(toolsTab, 'offsetLeft', { configurable: true, value: 120 });
    Object.defineProperty(toolsTab, 'offsetWidth', { configurable: true, value: 80 });

    wireNavigation();
    await frame();
    expect(indicator.style.left).toBe('10px');
    expect(indicator.style.width).toBe('50px');

    toolsTab.click();
    await expectTransform(track, 'translate3d(-100%, 0, 0)');
    expect(indicator.style.left).toBe('120px');

    Object.defineProperty(toolsTab, 'offsetLeft', { configurable: true, value: 140 });
    Object.defineProperty(toolsTab, 'offsetWidth', { configurable: true, value: 90 });
    window.dispatchEvent(new Event('resize'));

    expect(indicator.style.left).toBe('140px');
    expect(indicator.style.width).toBe('90px');
    expect(track.style.transition).toBe('none');
    expect(track.style.transform).toBe('translate3d(-100%, 0, 0)');
  });

  it('initialises without a home tab', async () => {
    tab('home-page').remove();
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');
    expect(document.getElementById('home-page')!.classList.contains('page--suppressed')).toBe(false);
  });

  it('ignores tabs with unknown or missing page ids', async () => {
    tab('tools-page').setAttribute('data-page', 'bogus-page');
    tab('settings-page').removeAttribute('data-page');
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    tab('bogus-page').click();
    await tick();
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');

    // The settings tab is now identified by its class only.
    (document.querySelectorAll('.nav-tab')[3] as HTMLElement).click();
    await tick();
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');
    expect(tab('home-page').classList.contains('nav-tab--active')).toBe(true);
  });
});

describe('popstate handling', () => {
  it('closes the topmost dialog and stops other popstate listeners', async () => {
    wireNavigation();
    await frame();

    const dialog = document.createElement('md-dialog');
    dialog.setAttribute('open', '');
    const close = vi.fn();
    (dialog as any).close = close;
    document.body.appendChild(dialog);

    const later = vi.fn();
    window.addEventListener('popstate', later);

    window.dispatchEvent(new Event('popstate'));

    expect(close).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(tab('home-page').classList.contains('nav-tab--active')).toBe(true);
  });

  it('leaves the page alone while an overlay is open', async () => {
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    tab('tools-page').click();
    await expectTransform(track, 'translate3d(-100%, 0, 0)');

    (window as unknown as Record<string, unknown>).isOverlayOpen = true;
    window.dispatchEvent(new Event('popstate'));
    await tick();
    expect(tab('tools-page').classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(-100%, 0, 0)');

    delete (window as unknown as Record<string, unknown>).isOverlayOpen;
    window.dispatchEvent(new Event('popstate'));
    await expectTransform(track, 'translate3d(0%, 0, 0)');
    expect(tab('home-page').classList.contains('nav-tab--active')).toBe(true);
  });

  it('closes the window when back is pressed on the home page', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    wireNavigation();
    await frame();

    window.dispatchEvent(new Event('popstate'));
    expect(close).toHaveBeenCalledTimes(1);

    // With no active tab the page id falls back to home.
    document.querySelector('.nav-tab--active')!.classList.remove('nav-tab--active');
    window.dispatchEvent(new Event('popstate'));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('returns home from another tab and re-arms the exit history entry', async () => {
    const push = vi.spyOn(history, 'pushState');
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;
    tab('tools-page').click();
    await expectTransform(track, 'translate3d(-100%, 0, 0)');
    expect(push).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('popstate'));
    await expectTransform(track, 'translate3d(0%, 0, 0)');
    expect(tab('home-page').classList.contains('nav-tab--active')).toBe(true);

    tab('settings-page').click();
    await expectTransform(track, 'translate3d(-300%, 0, 0)');
    expect(push).toHaveBeenCalledTimes(2);
  });
});

describe('transition scheduling', () => {
  it('cancels stale frame work, in-flight timers and superseded activations', async () => {
    wireNavigation();
    await frame();

    const track = document.getElementById('pages')!;

    // The frame callback runs but its deferred start is superseded before it fires.
    tab('tools-page').click();
    await frame();
    tab('settings-page').click();
    await expectTransform(track, 'translate3d(-300%, 0, 0)');

    // A second activation clears the pending suppression timer.
    tab('control-page').click();
    // A further activation cancels the frame that the previous click queued.
    tab('settings-page').click();
    await expectTransform(track, 'translate3d(-300%, 0, 0)');

    await new Promise(r => setTimeout(r, 380));
    expect(document.getElementById('settings-page')!.classList.contains('page--suppressed')).toBe(false);
    expect(document.getElementById('control-page')!.classList.contains('page--suppressed')).toBe(true);
  });
});

describe('swipe option guards', () => {
  it('handles non-smooth activation, missing tabs and missing indicator targets', async () => {
    let captured: any;
    vi.resetModules();
    vi.doMock('./swipe-controller.js', () => ({
      wireSwipeNavigation: (options: any) => { captured = options; },
    }));

    const track = document.getElementById('pages')!;
    const indicator = document.getElementById('nav-indicator')!;
    Object.defineProperty(tab('home-page'), 'offsetLeft', { configurable: true, value: 10 });
    Object.defineProperty(tab('home-page'), 'offsetWidth', { configurable: true, value: 20 });
    Object.defineProperty(tab('tools-page'), 'offsetLeft', { configurable: true, value: 50 });
    Object.defineProperty(tab('tools-page'), 'offsetWidth', { configurable: true, value: 30 });

    // Remove the last tab so an activation can ask for a tab that is not there.
    tab('settings-page').remove();

    const { wireNavigation: wireFresh } = await import('./navigation.js');
    wireFresh();
    await frame();

    expect(captured).toBeTruthy();
    expect(captured.getCurrentIndex()).toBe(0);
    expect(captured.isRTL()).toBe(false);

    // Out-of-range indexes and a missing tab are ignored.
    captured.activateIndex(-1, true);
    captured.activateIndex(9, true);
    captured.activateIndex(3, true);
    await tick();
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');

    // Non-smooth activation applies layout immediately.
    captured.activateIndex(2, false);
    expect(track.style.transform).toBe('translate3d(-200%, 0, 0)');
    expect(track.style.transition).toBe('none');
    expect(document.getElementById('control-page')!.classList.contains('page--suppressed')).toBe(false);
    expect(document.getElementById('home-page')!.classList.contains('page--suppressed')).toBe(true);
    expect(pageLoader.schedulePageWork).toHaveBeenCalledWith('control-page', false);

    // The indicator ignores indexes that do not exist and interpolates otherwise.
    captured.setIndicatorProgress(9, 0, 0.4);
    expect(indicator.style.left).toBe('0px');
    captured.setIndicatorProgress(0, 1, 0.5);
    expect(indicator.style.left).toBe('30px');
    expect(indicator.style.width).toBe('25px');

    // Track offsets fall back to the track width and then the window width.
    Object.defineProperty(track, 'offsetWidth', { configurable: true, value: 200 });
    captured.setTrackPosition(1, false, 100, 0);
    expect(track.style.transform).toBe('translate3d(-50%, 0, 0)');

    Object.defineProperty(track, 'offsetWidth', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 400 });
    captured.setTrackPosition(1, false, 100, 0);
    expect(track.style.transform).toBe('translate3d(-75%, 0, 0)');

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 0 });
    captured.setTrackPosition(1, false, 100, 0);
    expect(track.style.transform).toBe('translate3d(9900%, 0, 0)');

    vi.doUnmock('./swipe-controller.js');
    vi.resetModules();
  });
});
