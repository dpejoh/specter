import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onPageActivate, wireNavigation } from './navigation.js';

vi.mock('./material-tools.js', () => ({}));
vi.mock('./material-control.js', () => ({}));
vi.mock('./material-settings.js', () => ({}));

// Treat the shared page components as already warmed so page work uses the
// next task instead of waiting for an idle callback.
if (!customElements.get('sp-settings-row')) {
  customElements.define('sp-settings-row', class extends HTMLElement {});
}
if (!customElements.get('md-switch')) {
  customElements.define('md-switch', class extends HTMLElement {});
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

beforeEach(() => {
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
      <section id="tools-page" hidden><sp-settings-row></sp-settings-row></section>
      <section id="control-page" hidden></section>
      <section id="settings-page" hidden></section>
    </div>
  `;
});

describe('page loading', () => {
  it('does not start page work on pointerdown', async () => {
    const loader = vi.fn();
    onPageActivate('control-page', loader);
    wireNavigation();
    await frame();

    const tab = document.querySelector('[data-page="control-page"]') as HTMLElement;
    tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();

    expect(loader).not.toHaveBeenCalled();
  });

  it('shows a skeleton after the tab switch and reveals the page when wiring finishes', async () => {
    let finish!: () => void;
    const loading = new Promise<void>(resolve => { finish = resolve; });
    const loader = vi.fn(() => loading);
    onPageActivate('tools-page', loader);
    wireNavigation();
    await frame();

    const tab = document.querySelector('[data-page="tools-page"]') as HTMLElement;
    const page = document.getElementById('tools-page')!;
    tab.click();

    // The tab responds immediately and the page is covered by a skeleton.
    expect(tab.classList.contains('nav-tab--active')).toBe(true);
    expect(page.classList.contains('page--loading')).toBe(true);
    expect(page.getAttribute('aria-busy')).toBe('true');
    expect(page.querySelector(':scope > sp-page-skeleton')).not.toBeNull();
    expect(loader).not.toHaveBeenCalled();

    // Page work starts only after the switch frame has been painted.
    await frame();
    await tick();
    await tick();
    expect(loader).toHaveBeenCalledTimes(1);

    finish();
    await tick();
    await tick();

    expect(page.classList.contains('page--loading')).toBe(false);
    expect(page.hasAttribute('aria-busy')).toBe(false);
    expect(page.querySelector(':scope > sp-page-skeleton')).toBeNull();
  });
});
