import { describe, expect, it, beforeEach } from 'vitest';
import { wireNavigation } from './navigation.js';

describe('wireNavigation directional animations', () => {
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
        <section id="tools-page" hidden></section>
        <section id="control-page" hidden></section>
        <section id="settings-page" hidden></section>
      </div>
    `;
  });

  it('applies directional track transforms when moving between tabs', async () => {
    wireNavigation();

    // Trigger rAF for initial load
    await new Promise(resolve => requestAnimationFrame(resolve));

    const track = document.getElementById('pages')!;
    const homePage = document.getElementById('home-page')!;
    const toolsPage = document.getElementById('tools-page')!;

    const homeTab = document.querySelector('[data-page="home-page"]') as HTMLElement;
    const toolsTab = document.querySelector('[data-page="tools-page"]') as HTMLElement;
    const controlTab = document.querySelector('[data-page="control-page"]') as HTMLElement;
    const settingsTab = document.querySelector('[data-page="settings-page"]') as HTMLElement;

    // Initially home-page is shown (index 0)
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');
    expect(homeTab.classList.contains('nav-tab--active')).toBe(true);

    // Switch Forward: Home (0) -> Tools (1)
    toolsTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(toolsTab.classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(-100%, 0, 0)');

    // Switch Forward: Tools (1) -> Settings (3)
    settingsTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(settingsTab.classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(-300%, 0, 0)');

    // Switch Backward: Settings (3) -> Control (2)
    controlTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(controlTab.classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(-200%, 0, 0)');

    // Switch Backward: Control (2) -> Home (0)
    homeTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(homeTab.classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(0%, 0, 0)');

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
    await new Promise(resolve => requestAnimationFrame(resolve));

    const track = document.getElementById('pages')!;
    const toolsTab = document.querySelector('[data-page="tools-page"]') as HTMLElement;

    // Simulate touch drag from Home to Tools (drag left)
    const touchStart = new TouchEvent('touchstart', {
      touches: [{ clientX: 300, clientY: 200 } as any]
    });
    document.dispatchEvent(touchStart);

    // Move horizontally by -100px
    const touchMove = new TouchEvent('touchmove', {
      cancelable: true,
      touches: [{ clientX: 200, clientY: 200 } as any]
    });
    document.dispatchEvent(touchMove);

    // In touchmove, track transform is updated in real time with offset
    expect(track.style.transition).toBe('none');
    expect(track.style.transform).toContain('translate3d');

    // Touch end past threshold
    const touchEnd = new TouchEvent('touchend', {
      changedTouches: [{ clientX: 100, clientY: 200 } as any]
    });
    document.dispatchEvent(touchEnd);

    await new Promise(r => setTimeout(r, 20));
    expect(toolsTab.classList.contains('nav-tab--active')).toBe(true);
    expect(track.style.transform).toBe('translate3d(-100%, 0, 0)');

    // Allow background dynamic imports to settle
    await new Promise(r => setTimeout(r, 150));
  });
});
