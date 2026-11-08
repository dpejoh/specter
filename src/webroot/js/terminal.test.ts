import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logs: new Map<string, string>(),
  subpageConfig: null as unknown,
}));

const { exec, showToast, openSubPage, wireRowActivation } = vi.hoisted(() => ({
  exec: vi.fn(async (cmd: string) => {
    for (const [name, content] of h.logs) {
      if (cmd.includes(name)) return { stdout: content, stderr: '', code: 0 };
    }
    return { stdout: '', stderr: '', code: 0 };
  }),
  showToast: vi.fn(),
  openSubPage: vi.fn(async (config: unknown) => {
    h.subpageConfig = config;
    return { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
  }),
  wireRowActivation: vi.fn(),
}));

vi.mock('./bridge.js', () => ({ exec, getDataDir: () => '/data/adb/specter' }));
vi.mock('./toast.js', () => ({ showToast }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));
vi.mock('./utils.js', () => ({
  shellEscape: (v: string) => `'${v}'`,
  wireRowActivation,
  afterPaint: (fn: () => void) => { setTimeout(fn, 0); },
}));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('@material/web/iconbutton/icon-button.js', () => ({}));
vi.mock('@material/web/icon/icon.js', () => ({}));
vi.mock('@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js', () => ({}));
vi.mock('@material/web/labs/segmentedbutton/outlined-segmented-button.js', () => ({}));

import { appendToOutput, clearCurrentLog, getCurrentLogText, initTerminal, openLogsSubPage } from './terminal.js';

interface LogsConfig {
  headerAction: (container: HTMLElement) => void;
  groups: { items: { render: (host: HTMLElement) => void }[] }[];
  onClose: () => void;
}

async function openAndRender() {
  await openLogsSubPage();
  const config = h.subpageConfig as LogsConfig;
  const host = document.createElement('div');
  document.body.appendChild(host);
  config.groups[0]!.items[0]!.render(host);
  // renderCurrentLog is async (device log fetch)
  await new Promise(r => setTimeout(r, 10));
  return { config, host };
}

const tabBtn = (host: HTMLElement, value: string) =>
  host.querySelector(`md-outlined-segmented-button[value="${value}"]`)!;
const viewport = (host: HTMLElement) => host.querySelector('#logs-viewport')!;
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

describe('terminal / logs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    h.logs.clear();
    h.subpageConfig = null;
    vi.clearAllMocks();
    exec.mockImplementation(async (cmd: string) => {
      for (const [name, content] of h.logs) {
        if (cmd.includes(name)) return { stdout: content, stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });
  });

  it('renders the action log with command, error and blank line styling', async () => {
    h.logs.set('action.log', '> pipeline start\nall good\nError: mount failed\n\nlast line');
    const { host } = await openAndRender();

    const lines = viewport(host).querySelectorAll('.logs-terminal-line');
    expect(lines).toHaveLength(4);
    expect(lines[0]!.classList.contains('logs-line--command')).toBe(true);
    expect(lines[2]!.classList.contains('output-line--error')).toBe(true);
    expect(viewport(host).querySelectorAll('br')).toHaveLength(1);
    expect((host.querySelector('#logs-empty-view') as HTMLElement).style.display).toBe('none');
    expect(getCurrentLogText()).toContain('all good');
  });

  it('shows the empty state for an empty boot log', async () => {
    const { host } = await openAndRender();
    click(tabBtn(host, 'boot'));
    await new Promise(r => setTimeout(r, 10));
    expect((host.querySelector('#logs-empty-view') as HTMLElement).style.display).toBe('flex');
    expect(viewport(host).children).toHaveLength(0);
  });

  it('streams live output into the viewport while the live tab is active', async () => {
    const { host } = await openAndRender();
    click(tabBtn(host, 'live'));
    await new Promise(r => setTimeout(r, 10));

    appendToOutput('live one');
    appendToOutput('live two', true);
    const lines = viewport(host).querySelectorAll('.logs-terminal-line');
    expect(lines).toHaveLength(2);
    expect(lines[1]!.classList.contains('output-line--error')).toBe(true);
  });

  it('clears the device log for file tabs and the buffer for live', async () => {
    h.logs.set('action.log', 'some action output');
    const { config, host } = await openAndRender();
    expect(viewport(host).querySelectorAll('.logs-terminal-line').length).toBeGreaterThan(0);

    await clearCurrentLog();
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('action.log') && String(cmd).includes(': >'))).toBe(true);
    expect(viewport(host).children).toHaveLength(0);
    expect((host.querySelector('#logs-empty-view') as HTMLElement).style.display).toBe('flex');

    click(tabBtn(host, 'live'));
    await new Promise(r => setTimeout(r, 10));
    // The live buffer is module state shared across the session; start
    // from a clean slate before counting lines.
    await clearCurrentLog();
    appendToOutput('temp');
    expect(viewport(host).querySelectorAll('.logs-terminal-line')).toHaveLength(1);
    await clearCurrentLog();
    click(tabBtn(host, 'boot'));
    click(tabBtn(host, 'live'));
    await new Promise(r => setTimeout(r, 10));
    expect(viewport(host).querySelectorAll('.logs-terminal-line')).toHaveLength(0);
    config.onClose();
  });

  it('header actions refresh, copy and clear', async () => {
    h.logs.set('action.log', 'copy me');
    const { config, host } = await openAndRender();
    const header = document.createElement('div');
    config.headerAction(header);

    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    exec.mockClear();
    click(header.querySelector('#logs-refresh-btn')!);
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('Refreshed', expect.objectContaining({ type: 'info' })));
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('action.log'))).toBe(true);

    click(header.querySelector('#logs-copy-btn')!);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]![0]).toContain('copy me');
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Copied!', expect.objectContaining({ type: 'success' }));
    });

    click(header.querySelector('#logs-clear-btn')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Clear', expect.objectContaining({ type: 'info' }));
    });
    expect(viewport(host).children).toHaveLength(0);
  });

  it('initTerminal wires the settings row to open the logs page', () => {
    const row = document.createElement('div');
    row.id = 'row-logs';
    document.body.appendChild(row);
    initTerminal();
    expect(wireRowActivation).toHaveBeenCalledWith(row, expect.any(Function));
  });
});
