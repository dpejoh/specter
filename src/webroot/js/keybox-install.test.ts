import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cfgSet, exec, getModuleDir, refreshKeyboxStatus, runAction } = vi.hoisted(() => ({
  cfgSet: vi.fn(),
  exec: vi.fn(async (_command: string) => ({ stdout: '', stderr: '', code: 0 })),
  getModuleDir: vi.fn((): string | null => '/data/adb/modules/specter'),
  refreshKeyboxStatus: vi.fn(async () => {}),
  runAction: vi.fn(async () => 0),
}));

vi.mock('./cfg.js', () => ({ cfgSet }));
vi.mock('./bridge.js', () => ({ exec, getModuleDir }));
vi.mock('./device.js', () => ({ refreshKeyboxStatus }));
vi.mock('./actions.js', () => ({ runAction }));

import { installKeybox } from './keybox-install.js';

beforeEach(() => {
  cfgSet.mockClear();
  exec.mockClear();
  getModuleDir.mockReturnValue('/data/adb/modules/specter');
  refreshKeyboxStatus.mockClear();
  runAction.mockClear();
  runAction.mockResolvedValue(0);
});

describe('keybox install pipeline', () => {
  it('writes URL source config and refreshes keybox info after a successful install', async () => {
    const onInstalled = vi.fn();

    await expect(installKeybox({
      text: 'https://example.com/keybox.xml',
      privateKeybox: true,
      label: 'TAKR v36',
      onInstalled,
    })).resolves.toBe(true);

    expect(cfgSet).toHaveBeenCalledWith('keybox_private', 'true');
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'url');
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', 'https://example.com/keybox.xml');
    expect(runAction).toHaveBeenCalledWith('keybox.sh', undefined, {
      feedback: 'toast',
      loadingLabel: 'Installing keybox…',
      successLabel: 'TAKR v36 · Installed',
    });

    const commands = exec.mock.calls.map(([command]) => String(command));
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("features/keybox_info.sh'");
    expect(commands[1]).toContain("refresh_desc.sh'");
    expect(refreshKeyboxStatus).toHaveBeenCalledTimes(1);
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('treats a non-http source as a path and clears the private flag', async () => {
    await expect(installKeybox({
      text: '/sdcard/keybox.xml',
      privateKeybox: false,
    })).resolves.toBe(true);

    expect(cfgSet).toHaveBeenCalledWith('keybox_private', '');
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'path');
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', '/sdcard/keybox.xml');
    expect(runAction).toHaveBeenCalledWith('keybox.sh', undefined, expect.objectContaining({
      successLabel: 'Keybox installed',
    }));
  });

  it('does not write custom-source config for a catalog install', async () => {
    await expect(installKeybox()).resolves.toBe(true);

    expect(cfgSet).not.toHaveBeenCalled();
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(refreshKeyboxStatus).toHaveBeenCalledTimes(1);
  });

  it('stops before the action when the module directory is unknown', async () => {
    getModuleDir.mockReturnValue(null);

    await expect(installKeybox({ text: '/sdcard/keybox.xml' })).resolves.toBe(false);

    expect(runAction).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(refreshKeyboxStatus).not.toHaveBeenCalled();
  });

  it('returns false and skips refreshes when the action exits non-zero', async () => {
    runAction.mockResolvedValue(1);
    const onInstalled = vi.fn();

    await expect(installKeybox({
      text: '/sdcard/keybox.xml',
      label: 'Custom',
      onInstalled,
    })).resolves.toBe(false);

    expect(exec).not.toHaveBeenCalled();
    expect(refreshKeyboxStatus).not.toHaveBeenCalled();
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('rejects when the action itself throws, without refreshing anything', async () => {
    runAction.mockRejectedValue(new Error('spawn failed'));

    await expect(installKeybox({ label: 'Broken' })).rejects.toThrow('spawn failed');

    expect(exec).not.toHaveBeenCalled();
    expect(refreshKeyboxStatus).not.toHaveBeenCalled();
  });

  it('still refreshes the hero status when the keybox info script fails', async () => {
    exec.mockRejectedValueOnce(new Error('keybox_info failed'));
    exec.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 });
    const onInstalled = vi.fn();

    await expect(installKeybox({ text: '/sdcard/keybox.xml', onInstalled })).resolves.toBe(true);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(refreshKeyboxStatus).toHaveBeenCalledTimes(1);
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('still refreshes the hero status when the description refresh fails', async () => {
    exec.mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 });
    exec.mockRejectedValueOnce(new Error('refresh_desc failed'));

    await expect(installKeybox({ label: 'Custom' })).resolves.toBe(true);

    expect(refreshKeyboxStatus).toHaveBeenCalledTimes(1);
  });

  it('completes the install when the status refresh rejects', async () => {
    refreshKeyboxStatus.mockRejectedValueOnce(new Error('status refresh failed'));
    const onInstalled = vi.fn();

    await expect(installKeybox({ label: 'Custom', onInstalled })).resolves.toBe(true);

    expect(refreshKeyboxStatus).toHaveBeenCalledTimes(1);
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });
});
