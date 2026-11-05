import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cfgGet, cfgSet, exec, getModuleDir, refreshKeyboxStatus, showToast } = vi.hoisted(() => ({
  cfgGet: vi.fn(async () => ''),
  cfgSet: vi.fn(),
  exec: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
  refreshKeyboxStatus: vi.fn(async () => {}),
  showToast: vi.fn(),
}))

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }))
vi.mock('./bridge.js', () => ({ exec, getModuleDir }))
vi.mock('./device.js', () => ({ refreshKeyboxStatus }))
vi.mock('./toast.js', () => ({ showToast }))

import { mountLocalKeyboxForm } from './keybox-local-ui.js'

beforeEach(() => {
  document.body.innerHTML = ''
  cfgGet.mockReset()
  cfgGet.mockResolvedValue('')
  cfgSet.mockClear()
  exec.mockClear()
  exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  getModuleDir.mockReturnValue('/data/adb/modules/specter')
  refreshKeyboxStatus.mockClear()
  showToast.mockClear()
})

describe('local keybox form', () => {
  it('renders file, URL/path, and private-keybox controls', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    await mountLocalKeyboxForm(container)

    expect(container.querySelector('#kb-file-row')).not.toBeNull()
    expect(container.querySelector('#kb-url-input')).not.toBeNull()
    expect(container.querySelector('#kb-private-switch')).not.toBeNull()
  })

  it('applies a local URL or path', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onInstalled = vi.fn()

    const form = await mountLocalKeyboxForm(container, { onInstalled })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    input.value = '/sdcard/keybox.xml'
    input.dispatchEvent(new Event('input'))

    await expect(form.apply()).resolves.toBe(true)
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'path')
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', '/sdcard/keybox.xml')
    expect(exec).toHaveBeenCalledWith("sh '/data/adb/modules/specter/features/keybox.sh'")
    expect(onInstalled).toHaveBeenCalled()
  })

  it('does not apply an empty value', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const form = await mountLocalKeyboxForm(container)
    await expect(form.apply()).resolves.toBe(false)
    expect(exec).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })
})
