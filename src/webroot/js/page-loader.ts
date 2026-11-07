import { afterPaint } from './utils.js';
import './ui/sp-page-skeleton.js';

export const PAGE_IDS = ['home-page', 'tools-page', 'control-page', 'settings-page'] as const;
export type PageId = (typeof PAGE_IDS)[number];

const MANAGED_PAGES = new Set<PageId>(['tools-page', 'control-page', 'settings-page']);
const pageLoaders = new Map<PageId, (() => void | Promise<void>)[]>();
const pageLoadPromises = new Map<PageId, Promise<void>>();
const pagePreparePromises = new Map<PageId, Promise<void>>();
const pageReady = new Set<PageId>();
const pageMWC = new Map<PageId, Promise<void>>();

export function isPageId(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value);
}

/** Register work that runs once, when a page is first opened. */
export function onPageActivate(pageId: PageId, loader: () => void | Promise<void>) {
  const list = pageLoaders.get(pageId);
  if (list) list.push(loader);
  else pageLoaders.set(pageId, [loader]);
  const active = document.querySelector('.nav-tab--active')?.getAttribute('data-page');
  if (active && isPageId(active) && active === pageId) void runPageLoaders(pageId);
}

function runPageLoaders(pageId: PageId): Promise<void> {
  const pending = pageLoadPromises.get(pageId);
  if (pending) return pending;

  const loaders = pageLoaders.get(pageId) || [];
  const promise = Promise.all(
    loaders.map(loader => Promise.resolve().then(loader).catch(() => {})),
  ).then(() => {
    pageReady.add(pageId);
  });
  pageLoadPromises.set(pageId, promise);
  return promise;
}

export function isPagePending(pageId: PageId): boolean {
  return MANAGED_PAGES.has(pageId) && !pageReady.has(pageId);
}

/** Hide the real page and show a lightweight skeleton until its UI is ready. */
export function setPageLoading(pageId: PageId, loading: boolean) {
  const page = document.getElementById(pageId);
  if (!page) return;

  page.classList.toggle('page--loading', loading);
  if (loading) page.setAttribute('aria-busy', 'true');
  else page.removeAttribute('aria-busy');

  let skeleton = page.querySelector(':scope > sp-page-skeleton') as HTMLElement | null;
  if (loading) {
    if (skeleton) return;
    skeleton = document.createElement('sp-page-skeleton');
    page.prepend(skeleton);
  } else {
    skeleton?.remove();
  }
}

function loadPageMWC(pageId: PageId): Promise<void> {
  const existing = pageMWC.get(pageId);
  if (existing) return existing;

  const promise = (async () => {
    if (pageId === 'tools-page') await import('./material-tools.js');
    else if (pageId === 'control-page') await import('./material-control.js');
    else if (pageId === 'settings-page') await import('./material-settings.js');
  })();
  pageMWC.set(pageId, promise);
  return promise;
}

/** Load the page's components and wiring, then reveal it. */
export function preparePage(pageId: PageId): Promise<void> {
  const existing = pagePreparePromises.get(pageId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      await loadPageMWC(pageId);
      await runPageLoaders(pageId);
    } catch {
      // Reveal the page even if wiring failed; it may still be usable.
    }
    pageReady.add(pageId);
    setPageLoading(pageId, false);
  })();
  pagePreparePromises.set(pageId, promise);
  return promise;
}

/** True when the shared page components have already been defined. */
export function isPageUiWarm(): boolean {
  return !!customElements.get('sp-settings-row') && !!customElements.get('md-switch');
}

/**
 * Page code is loaded after the switch has painted. Cold pages wait for the
 * slide to finish so upgrading custom elements cannot stall it.
 */
export function schedulePageWork(pageId: PageId, smooth: boolean): void {
  if (pageReady.has(pageId)) return;

  const run = () => { void preparePage(pageId); };
  if (smooth && !isPageUiWarm()) {
    afterPaint(run, 420);
  } else {
    window.setTimeout(run, 0);
  }
}
