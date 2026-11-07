import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('./bridge.js', () => ({
  exec: vi.fn(),
  getModuleDir: vi.fn(),
}))

import { exec, getModuleDir } from './bridge.js'
import { isAnyModuleInstalled, isModuleInstalled } from './modules.js'

beforeEach(() => {
  vi.mocked(exec).mockReset()
  vi.mocked(getModuleDir).mockReturnValue('/data/adb/modules/specter')
  delete (window as { __modulesPromise?: unknown }).__modulesPromise
})

describe('isModuleInstalled', () => {
  it('returns true when the live module.prop exists', async () => {
    vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith(
      "test -f '/data/adb/modules/playintegrityfix/module.prop' || test -f '/data/adb/modules_update/playintegrityfix/module.prop'"
    )
  })

  it('returns false when neither live nor staged module.prop exists', async () => {
    vi.mocked(exec).mockResolvedValue({ code: 1, stdout: '', stderr: '' })
    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(false)
  })

  it('returns false when the bridge is unavailable', async () => {
    vi.mocked(exec).mockRejectedValue(new Error('no-bridge'))
    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(false)
  })

  it('falls back to /data/adb/modules when the module path is unknown', async () => {
    vi.mocked(getModuleDir).mockReturnValue(null)
    vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await isModuleInstalled('playintegrityfix')
    expect(exec).toHaveBeenCalledWith(
      "test -f '/data/adb/modules/playintegrityfix/module.prop' || test -f '/data/adb/modules_update/playintegrityfix/module.prop'"
    )
  })

  it('checks every id when a module has multiple possible ids', async () => {
    vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await isAnyModuleInstalled(['hma_oss_zygisk', 'hma_oss'])
    expect(exec).toHaveBeenCalledWith(
      "test -f '/data/adb/modules/hma_oss_zygisk/module.prop' || test -f '/data/adb/modules_update/hma_oss_zygisk/module.prop' || test -f '/data/adb/modules/hma_oss/module.prop' || test -f '/data/adb/modules_update/hma_oss/module.prop'"
    )
  })

  it('returns false without a shell call for an empty id list', async () => {
    await expect(isAnyModuleInstalled([])).resolves.toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })
})

describe('module state snapshot', () => {
  it('reads installed modules without a shell call', async () => {
    ;(window as { __modulesPromise?: Promise<unknown> }).__modulesPromise = Promise.resolve({
      modules: { playintegrityfix: true },
      conflicts: [],
    })

    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(true)
    expect(exec).not.toHaveBeenCalled()
  })

  it('treats a module missing from the snapshot as not installed', async () => {
    ;(window as { __modulesPromise?: Promise<unknown> }).__modulesPromise = Promise.resolve({
      modules: { hma_oss: true },
      conflicts: [],
    })

    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  it('falls back to the bridge when the snapshot has no module map', async () => {
    ;(window as { __modulesPromise?: Promise<unknown> }).__modulesPromise = Promise.resolve({
      conflicts: [],
    })
    vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    await expect(isModuleInstalled('playintegrityfix')).resolves.toBe(true)
    expect(exec).toHaveBeenCalled()
  })
})
