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

  it('applies directional animations when moving between tabs', async () => {
    wireNavigation();

    // Trigger rAF for initial load
    await new Promise(resolve => requestAnimationFrame(resolve));

    const homePage = document.getElementById('home-page')!;
    const toolsPage = document.getElementById('tools-page')!;
    const controlPage = document.getElementById('control-page')!;
    const settingsPage = document.getElementById('settings-page')!;

    const homeTab = document.querySelector('[data-page="home-page"]') as HTMLElement;
    const toolsTab = document.querySelector('[data-page="tools-page"]') as HTMLElement;
    const controlTab = document.querySelector('[data-page="control-page"]') as HTMLElement;
    const settingsTab = document.querySelector('[data-page="settings-page"]') as HTMLElement;

    // Initially home-page has page-enter-initial
    expect(homePage.classList.contains('page-enter-initial')).toBe(true);
    expect(homePage.hidden).toBe(false);

    // Switch Forward: Home (0) -> Tools (1)
    toolsTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(toolsPage.hidden).toBe(false);
    expect(homePage.hidden).toBe(true);
    expect(toolsPage.classList.contains('page-enter-forward')).toBe(true);
    expect(toolsPage.classList.contains('page-enter-backward')).toBe(false);

    // Switch Forward: Tools (1) -> Settings (3)
    settingsTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(settingsPage.hidden).toBe(false);
    expect(toolsPage.hidden).toBe(true);
    expect(settingsPage.classList.contains('page-enter-forward')).toBe(true);

    // Switch Backward: Settings (3) -> Control (2)
    controlTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(controlPage.hidden).toBe(false);
    expect(settingsPage.hidden).toBe(true);
    expect(controlPage.classList.contains('page-enter-backward')).toBe(true);
    expect(controlPage.classList.contains('page-enter-forward')).toBe(false);

    // Switch Backward: Control (2) -> Home (0)
    homeTab.click();
    await new Promise(r => setTimeout(r, 20));

    expect(homePage.hidden).toBe(false);
    expect(controlPage.hidden).toBe(true);
    expect(homePage.classList.contains('page-enter-backward')).toBe(true);

    // Clicking already active tab should not re-trigger or change
    homePage.classList.remove('page-enter-backward');
    homeTab.click();
    await new Promise(r => setTimeout(r, 20));
    expect(homePage.classList.contains('page-enter-backward')).toBe(false);
    expect(homePage.classList.contains('page-enter-forward')).toBe(false);
  });
});
