import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cfgGet, cfgSet, exec, getModuleDir, refreshKeyboxStatus, showToast, runAction, openFileBrowser } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (_key?: string) => ''),
  cfgSet: vi.fn(),
  exec: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
  refreshKeyboxStatus: vi.fn(async () => {}),
  showToast: vi.fn(),
  runAction: vi.fn(async () => 0),
  openFileBrowser: vi.fn(),
}))

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }))
vi.mock('./bridge.js', () => ({ exec, getModuleDir }))
vi.mock('./device.js', () => ({ refreshKeyboxStatus }))
vi.mock('./toast.js', () => ({ showToast }))
vi.mock('./actions.js', () => ({ runAction }))
vi.mock('./file-browser.js', () => ({ openFileBrowser }))

import { mountLocalKeyboxForm } from './keybox-local-ui.js'

function makeContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

function setClipboard(readText: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText },
  })
}

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
  runAction.mockClear()
  runAction.mockResolvedValue(0)
  openFileBrowser.mockReset()
  delete (navigator as unknown as { clipboard?: unknown }).clipboard
})

describe('local keybox form', () => {
  it('renders file, URL/path, and private-keybox controls', async () => {
    const container = makeContainer()

    await mountLocalKeyboxForm(container)

    expect(container.querySelector('#kb-file-row')).not.toBeNull()
    expect(container.querySelector('#kb-url-input')).not.toBeNull()
    expect(container.querySelector('#kb-private-switch')).not.toBeNull()
  })

  it('applies a local URL or path', async () => {
    const container = makeContainer()
    const onInstalled = vi.fn()

    const form = await mountLocalKeyboxForm(container, { onInstalled })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    input.value = '/sdcard/keybox.xml'
    input.dispatchEvent(new Event('input'))

    await expect(form.apply()).resolves.toBe(true)
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'path')
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', '/sdcard/keybox.xml')
    expect(runAction).toHaveBeenCalledWith('keybox.sh', undefined, expect.objectContaining({ feedback: 'toast' }))
    expect(onInstalled).toHaveBeenCalled()
  })

  it('does not apply an empty value', async () => {
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container)
    await expect(form.apply()).resolves.toBe(false)
    expect(exec).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  it('treats a persisted keybox path as text, never as HTML', async () => {
    const payload = '"><img src=x onerror=alert(1)>'
    cfgGet.mockImplementation(async (key?: string) => key === 'keybox_custom_value' ? payload : '')
    const container = makeContainer()

    await mountLocalKeyboxForm(container)

    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    expect(input.value).toBe(payload)
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('<img')
  })

  it('restores the persisted file and private toggle state', async () => {
    cfgGet.mockImplementation(async (key?: string) => {
      if (key === 'keybox_custom_value') return '/sdcard/old/keybox.xml'
      if (key === 'keybox_private') return 'true'
      return ''
    })
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container)

    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    const subtitle = container.querySelector('#kb-file-subtitle') as HTMLElement
    const icon = container.querySelector('#kb-file-icon') as HTMLElement
    const privateSwitch = container.querySelector('#kb-private-switch') as HTMLElement & { selected: boolean }
    expect(input.value).toBe('/sdcard/old/keybox.xml')
    expect(subtitle.textContent).toBe('keybox.xml')
    expect(subtitle.classList.contains('kb-file-subtitle--active')).toBe(true)
    expect(icon.textContent).toBe('vpn_key')
    expect(privateSwitch.selected).toBe(true)

    await expect(form.apply()).resolves.toBe(true)
    expect(cfgSet).toHaveBeenCalledWith('keybox_private', 'true')
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', '/sdcard/old/keybox.xml')
  })

  it('marks a persisted directory value as an active file source', async () => {
    cfgGet.mockImplementation(async (key?: string) => key === 'keybox_custom_value' ? '/sdcard/' : '')
    const container = makeContainer()

    await mountLocalKeyboxForm(container)

    expect((container.querySelector('#kb-url-input') as HTMLInputElement).value).toBe('/sdcard/')
    expect((container.querySelector('#kb-file-icon') as HTMLElement).textContent).toBe('vpn_key')
    expect((container.querySelector('#kb-file-subtitle') as HTMLElement).textContent).toBe('/sdcard/')
    expect(container.querySelector('#kb-file-subtitle')?.classList.contains('kb-file-subtitle--active')).toBe(true)
  })

  it('trims typed input, updates the file row, and clears it again', async () => {
    const container = makeContainer()
    const onValueChange = vi.fn()

    const form = await mountLocalKeyboxForm(container, { onValueChange })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    const subtitle = container.querySelector('#kb-file-subtitle') as HTMLElement
    const icon = container.querySelector('#kb-file-icon') as HTMLElement

    input.value = '  /sdcard/a.xml  '
    input.dispatchEvent(new Event('input'))

    expect(subtitle.textContent).toBe('a.xml')
    expect(subtitle.classList.contains('kb-file-subtitle--active')).toBe(true)
    expect(icon.textContent).toBe('vpn_key')
    expect(onValueChange).toHaveBeenLastCalledWith(true)

    input.value = '   '
    input.dispatchEvent(new Event('input'))

    expect(subtitle.textContent).toBe('Select a keybox XML file from your device')
    expect(subtitle.classList.contains('kb-file-subtitle--active')).toBe(false)
    expect(icon.textContent).toBe('upload_file')
    expect(onValueChange).toHaveBeenLastCalledWith(false)

    await expect(form.apply()).resolves.toBe(false)
    expect(showToast).toHaveBeenCalled()
  })

  it('installs a path chosen in the file browser', async () => {
    const onValueChange = vi.fn()
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container, { onValueChange })
    const fileRow = container.querySelector('#kb-file-row') as HTMLElement
    fileRow.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }))

    await vi.waitFor(() => expect(openFileBrowser).toHaveBeenCalledTimes(1))
    const [onPick, options] = openFileBrowser.mock.calls[0] as [
      (path: string) => void,
      { title: string },
    ]
    expect(options.title).toMatch(/^Internal storage$/i)

    onPick('/sdcard/picked/keybox.xml')

    expect((container.querySelector('#kb-url-input') as HTMLInputElement).value)
      .toBe('/sdcard/picked/keybox.xml')
    expect((container.querySelector('#kb-file-subtitle') as HTMLElement).textContent).toBe('keybox.xml')
    expect((container.querySelector('#kb-file-icon') as HTMLElement).textContent).toBe('vpn_key')
    expect(onValueChange).toHaveBeenLastCalledWith(true)

    await expect(form.apply()).resolves.toBe(true)
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'path')
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_value', '/sdcard/picked/keybox.xml')
  })

  it('pastes a keybox URL from the clipboard', async () => {
    const readText = vi.fn(async () => '  https://example.com/keybox.xml  ')
    setClipboard(readText)
    const onValueChange = vi.fn()
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container, { onValueChange })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    ;(container.querySelector('#kb-paste-btn') as HTMLElement).click()

    await vi.waitFor(() => expect(input.value).toBe('https://example.com/keybox.xml'))
    expect(readText).toHaveBeenCalledTimes(1)
    expect((container.querySelector('#kb-file-subtitle') as HTMLElement).textContent).toBe('keybox.xml')
    expect(onValueChange).toHaveBeenLastCalledWith(true)

    await expect(form.apply()).resolves.toBe(true)
    expect(cfgSet).toHaveBeenCalledWith('keybox_custom_type', 'url')
  })

  it('ignores an empty clipboard value', async () => {
    const readText = vi.fn(async () => '')
    setClipboard(readText)
    const onValueChange = vi.fn()
    const container = makeContainer()

    await mountLocalKeyboxForm(container, { onValueChange })
    onValueChange.mockClear()
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    ;(container.querySelector('#kb-paste-btn') as HTMLElement).click()

    await vi.waitFor(() => expect(readText).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(input.value).toBe('')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('ignores whitespace-only clipboard text without clearing the input', async () => {
    const readText = vi.fn(async () => '   \n\t ')
    setClipboard(readText)
    const onValueChange = vi.fn()
    const container = makeContainer()

    await mountLocalKeyboxForm(container, { onValueChange })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    input.value = '/sdcard/keep.xml'
    input.dispatchEvent(new Event('input'))
    onValueChange.mockClear()

    ;(container.querySelector('#kb-paste-btn') as HTMLElement).click()

    await vi.waitFor(() => expect(readText).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(input.value).toBe('/sdcard/keep.xml')
    expect((container.querySelector('#kb-file-subtitle') as HTMLElement).textContent).toBe('keep.xml')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('warns and keeps the input when the clipboard cannot be read', async () => {
    setClipboard(vi.fn(async () => { throw new Error('clipboard denied') }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = makeContainer()

    await mountLocalKeyboxForm(container)
    ;(container.querySelector('#kb-paste-btn') as HTMLElement).click()

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Clipboard read failed:', expect.any(Error)))
    expect((container.querySelector('#kb-url-input') as HTMLInputElement).value).toBe('')
    warn.mockRestore()
  })

  it('persists the private-keybox toggle in both directions', async () => {
    const container = makeContainer()

    await mountLocalKeyboxForm(container)
    const privateSwitch = container.querySelector('#kb-private-switch') as HTMLElement & { selected: boolean }

    privateSwitch.selected = true
    privateSwitch.dispatchEvent(new Event('change'))
    expect(cfgSet).toHaveBeenLastCalledWith('keybox_private', 'true')

    privateSwitch.selected = false
    privateSwitch.dispatchEvent(new Event('change'))
    expect(cfgSet).toHaveBeenLastCalledWith('keybox_private', '')
  })

  it('falls back to empty values when config reads fail', async () => {
    cfgGet.mockRejectedValue(new Error('config unavailable'))
    const onValueChange = vi.fn()
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container, { onValueChange })

    expect((container.querySelector('#kb-url-input') as HTMLInputElement).value).toBe('')
    expect(onValueChange).toHaveBeenCalledWith(false)
    await expect(form.apply()).resolves.toBe(false)
    expect(showToast).toHaveBeenCalled()
  })

  it('returns false when the install action fails', async () => {
    runAction.mockResolvedValue(1)
    const onInstalled = vi.fn()
    const container = makeContainer()

    const form = await mountLocalKeyboxForm(container, { onInstalled })
    const input = container.querySelector('#kb-url-input') as HTMLInputElement
    input.value = '/sdcard/keybox.xml'
    input.dispatchEvent(new Event('input'))

    await expect(form.apply()).resolves.toBe(false)
    expect(onInstalled).not.toHaveBeenCalled()
  })
})
