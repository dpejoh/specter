import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exec, setupOverlayA11y } = vi.hoisted(() => ({
  exec: vi.fn(),
  setupOverlayA11y: vi.fn(() => () => {}),
}));

vi.mock('./bridge.js', () => ({ exec }));
vi.mock('./overlay-a11y.js', () => ({ setupOverlayA11y }));
vi.mock('./menu-utils.js', () => ({ closeMenu: vi.fn(), wireMenuTrigger: vi.fn() }));
vi.mock('@material/web/menu/menu.js', () => ({}));
vi.mock('@material/web/menu/menu-item.js', () => ({}));

import { openFileBrowser } from './file-browser.js';

const ROOT_FIND = [
  'directory|0|1700000000|/sdcard/Docs',
  'directory|0|1700000000|/sdcard/Empty',
  'directory|0|1700000000|/sdcard/Legacy',
  'regular file|2048|1700000000|/sdcard/keybox.xml',
  'regular file|512|1700000000|/sdcard/notes.txt',
  'regular file|100|1700000000|/sdcard/backup.bak',
].join('\n');

function execImpl(cmd: string) {
  if (cmd.startsWith('find ')) {
    if (cmd.includes("'/sdcard/Docs'")) {
      return { stdout: 'regular file|111|1700000000|/sdcard/Docs/inner.xml', stderr: '', code: 0 };
    }
    if (cmd.includes("'/sdcard'")) return { stdout: ROOT_FIND, stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }
  if (cmd.startsWith('ls ')) {
    if (cmd.includes("'/sdcard/Legacy'")) return { stdout: 'old.xml\nsub/\n', stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }
  return { stdout: '', stderr: '', code: 0 };
}

const overlay = () => document.querySelector('.subpage-overlay--file-browser') as HTMLElement;
const rowNames = () => [...overlay().querySelectorAll('.fb-row .fb-name')].map(el => el.textContent);
const rowByName = (name: string) =>
  [...overlay().querySelectorAll<HTMLElement>('.fb-row')].find(r => r.querySelector('.fb-name')?.textContent === name);

describe('file browser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    exec.mockReset();
    exec.mockImplementation(async (cmd: string) => execImpl(cmd));
    setupOverlayA11y.mockClear();
    window.isOverlayOpen = false;
  });

  it('lists folders first and only files matching the default extensions', async () => {
    await openFileBrowser(vi.fn());

    expect(rowNames()).toEqual(['Docs', 'Empty', 'Legacy', 'backup.bak', 'keybox.xml']);
    const crumbs = overlay().querySelectorAll('.fb-crumb');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]!.classList.contains('fb-crumb--current')).toBe(true);
    expect(window.isOverlayOpen).toBe(true);
  });

  it('navigates into a folder and back via breadcrumbs', async () => {
    await openFileBrowser(vi.fn());

    rowByName('Docs')!.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(rowNames()).toEqual(['inner.xml']));
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes("'/sdcard/Docs'"))).toBe(true);

    const crumbs = overlay().querySelectorAll('.fb-crumb');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[1]!.textContent?.trim()).toBe('Docs');

    (crumbs[0] as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(rowNames()).toContain('keybox.xml'));
  });

  it('selects a file, reports its path and closes', async () => {
    const onSelect = vi.fn();
    await openFileBrowser(onSelect);

    rowByName('keybox.xml')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('/sdcard/keybox.xml');
    await vi.waitFor(() => expect(overlay()).toBeNull(), { timeout: 2000 });
    expect(window.isOverlayOpen).toBe(false);
  });

  it('activates rows from the keyboard', async () => {
    const onSelect = vi.fn();
    await openFileBrowser(onSelect);

    rowByName('backup.bak')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('/sdcard/backup.bak');
  });

  it('shows every file in All Files mode and filters again in primary mode', async () => {
    await openFileBrowser(vi.fn());
    expect(rowNames()).not.toContain('notes.txt');

    overlay().querySelector('#fb-menu-filter-all')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(rowNames()).toContain('notes.txt');

    overlay().querySelector('#fb-menu-filter-primary')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(rowNames()).not.toContain('notes.txt');
  });

  it('falls back to ls when find returns nothing', async () => {
    await openFileBrowser(vi.fn());

    rowByName('Legacy')!.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(rowNames()).toEqual(['sub', 'old.xml']));
    expect(exec.mock.calls.some(([cmd]) => String(cmd).startsWith('ls '))).toBe(true);
  });

  it('shows the empty label in an empty folder', async () => {
    await openFileBrowser(vi.fn(), { emptyLabel: 'Nothing usable here' });

    rowByName('Empty')!.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(overlay().querySelector('.fb-empty-title')?.textContent).toBe('Nothing usable here');
    });
  });

  it('ignores a second open while the browser is already showing', async () => {
    await openFileBrowser(vi.fn());
    const findCalls = exec.mock.calls.filter(([cmd]) => String(cmd).startsWith('find ')).length;

    await openFileBrowser(vi.fn());
    expect(document.querySelectorAll('.subpage-overlay--file-browser')).toHaveLength(1);
    expect(exec.mock.calls.filter(([cmd]) => String(cmd).startsWith('find ')).length).toBe(findCalls);
  });

  it('closes from the back button at the root', async () => {
    await openFileBrowser(vi.fn());
    overlay().querySelector('#fb-back')!.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(overlay()).toBeNull(), { timeout: 2000 });
  });
});
