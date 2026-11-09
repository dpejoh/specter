import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  openSubPage,
  runAction,
  exec,
  spawnCommand,
  showToast,
  showLoadingToast,
  updateToast,
  afterPaint,
  paintState,
} = vi.hoisted(() => {
  const paintState = { callback: null as (() => void) | null }
  return {
  openSubPage: vi.fn((config: {
    groups: { items: { type?: string; render?: (container: HTMLElement, isEnabled: () => boolean, posClass?: string) => void }[] }[];
  }) => {
    const overlay = document.createElement('div')
    const container = document.createElement('div')
    overlay.appendChild(container)
    for (const group of config.groups) {
      for (const item of group.items) {
        const host = document.createElement('div')
        container.appendChild(host)
        if (item.type === 'custom') item.render?.(host, () => true, '')
      }
    }
    return Promise.resolve({ overlay, close: vi.fn(), isMasterEnabled: () => true })
  }),
  runAction: vi.fn(async () => 0),
  exec: vi.fn(async (_cmd: string) => ({ code: 0, stdout: '', stderr: '' })),
  spawnCommand: vi.fn(async (_cmd: string) => ({ code: 0, stdout: '', stderr: '' })),
  showToast: vi.fn(),
  showLoadingToast: vi.fn((_message: string) => document.createElement('div')),
  updateToast: vi.fn(),
  afterPaint: vi.fn((fn: () => void) => { paintState.callback = fn }),
  paintState,
  }
})

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./actions.js', () => ({ runAction }))
vi.mock('./bridge.js', () => ({
  exec,
  spawnCommand,
  getModuleDir: () => '/data/adb/modules/specter',
}))
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast }))
vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>()
  return { ...actual, afterPaint }
})

import { openOmkRestartPage, openOmkTrustPage } from './omk-trust-ui.js'
import { t } from './i18n.js'

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const paint = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await settle()
}

beforeEach(() => {
  openSubPage.mockClear()
  runAction.mockClear()
  exec.mockReset()
  exec.mockImplementation(async () => ({ code: 0, stdout: '', stderr: '' }))
  spawnCommand.mockReset()
  spawnCommand.mockImplementation(async () => ({ code: 0, stdout: '', stderr: '' }))
  showToast.mockClear()
  showLoadingToast.mockClear()
  updateToast.mockClear()
  afterPaint.mockClear()
  paintState.callback = null
})

describe('OMK restart page', () => {
  it('offers keymint and injector restarts in one page', async () => {
    void openOmkRestartPage()

    const config = openSubPage.mock.calls[0]![0] as unknown as {
      title: string
      groups: { items: unknown[] }[]
    }
    const items = config.groups.flatMap(group => group.items)
    expect(config.title).toBe('Restart OMK')
    expect(items).toHaveLength(2)

    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const container = instance.overlay.firstElementChild as HTMLElement
    expect(container.querySelector('#omk-restart-keymint-row')).not.toBeNull()
    expect(container.querySelector('#omk-restart-injector-row')).not.toBeNull()
  })

  it('runs the selected restart script', async () => {
    void openOmkRestartPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const container = instance.overlay.firstElementChild as HTMLElement

    ;(container.querySelector('#omk-restart-keymint-row') as HTMLElement).dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runAction).toHaveBeenCalledWith('omk_restart_keymint.sh', 'tools_restart_omk_keymint')

    runAction.mockClear()
    ;(container.querySelector('#omk-restart-injector-row') as HTMLElement).dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runAction).toHaveBeenCalledWith('omk_restart_injector.sh', 'tools_restart_omk_injector')
  })
})

describe('OMK trust page', () => {
  type TrustConfig = {
    id: string
    title: string
    groups: { items: Record<string, unknown>[] }[]
    fab?: (container: HTMLElement, page: { overlay: HTMLElement; close: ReturnType<typeof vi.fn> }) => void
  }

  async function openTrustPage(): Promise<{
    config: TrustConfig
    instance: { overlay: HTMLElement; close: ReturnType<typeof vi.fn> }
  }> {
    await openOmkTrustPage()
    const config = openSubPage.mock.calls[0]![0] as unknown as TrustConfig
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{
      overlay: HTMLElement
      close: ReturnType<typeof vi.fn>
    }>)
    return { config, instance }
  }

  function mountFab(
    config: TrustConfig,
    instance: { overlay: HTMLElement; close: ReturnType<typeof vi.fn> },
  ) {
    const host = document.createElement('div')
    config.fab?.(host, instance)
    return host.querySelector('#omk-save-fab') as HTMLElement
  }

  it('opens the OS version and VB key as block input rows', async () => {
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('--get os_version')) return { code: 0, stdout: '15\n', stderr: '' }
      if (cmd.includes('--get vb_key')) return { code: 0, stdout: 'auto\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const { config } = await openTrustPage()
    const items = config.groups.flatMap(group => group.items)

    expect(config.id).toBe('omk-trust')
    expect(config.title).toBe('OMK OS & Boot Key')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'input',
      id: 'omk-os-version',
      layout: 'block',
      value: '',
      placeholder: 'auto',
    })
    expect(items[1]).toMatchObject({
      type: 'input',
      id: 'omk-vb-key',
      layout: 'block',
      value: '',
      maxLength: 64,
      mono: true,
    })
    expect(config.fab).toBeTypeOf('function')
  })

  it('fills the fields with the loaded values once the reads land', async () => {
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('--get os_version')) return { code: 0, stdout: '15\n', stderr: '' }
      if (cmd.includes('--get vb_key')) return { code: 0, stdout: 'auto\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const osInput = document.createElement('input')
    osInput.id = 'omk-os-version'
    const vbInput = document.createElement('input')
    vbInput.id = 'omk-vb-key'
    openSubPage.mockImplementationOnce(async () => {
      const overlay = document.createElement('div')
      overlay.append(osInput, vbInput)
      return { overlay, close: vi.fn(), isMasterEnabled: () => true }
    })

    await openOmkTrustPage()

    // The reads wait for the page's first paint: fields are still empty
    // and disabled, and no script call has been made yet.
    expect(exec).not.toHaveBeenCalled()
    expect(osInput.value).toBe('')
    expect(osInput.disabled).toBe(true)
    expect(vbInput.disabled).toBe(true)

    expect(paintState.callback).not.toBeNull()
    paintState.callback!()
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(osInput.value).toBe('15')
    expect(vbInput.value).toBe('auto')
    expect(osInput.disabled).toBe(false)
    expect(vbInput.disabled).toBe(false)
  })

  it('saves both values and keeps the subpage open', async () => {
    const { config, instance } = await openTrustPage()
    const osInput = document.createElement('input')
    osInput.id = 'omk-os-version'
    osInput.value = '16'
    const vbInput = document.createElement('input')
    vbInput.id = 'omk-vb-key'
    vbInput.value = 'auto'
    instance.overlay.append(osInput, vbInput)

    const fab = mountFab(config, instance)
    fab.click()

    // The disabled FAB and loading toast paint before the shell work starts.
    expect(fab.hasAttribute('disabled')).toBe(true)
    expect(showLoadingToast).toHaveBeenCalledTimes(1)
    expect(spawnCommand).not.toHaveBeenCalled()

    await paint()

    const commands = spawnCommand.mock.calls.map(([cmd]) => String(cmd))
    expect(commands.some(cmd => cmd.includes('--set') && cmd.includes('os_version=16') && cmd.includes('vb_key=auto'))).toBe(true)
    expect(commands.some(cmd => cmd.includes('refresh_desc.sh'))).toBe(true)
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('omk_saved', 'OMK OS & Boot Key saved'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    )
    expect(instance.close).not.toHaveBeenCalled()
    expect(fab.hasAttribute('disabled')).toBe(false)
  })

  it('reports a failed save, re-enables the FAB, and keeps the page open', async () => {
    const { config, instance } = await openTrustPage()
    const osInput = document.createElement('input')
    osInput.id = 'omk-os-version'
    osInput.value = '16'
    instance.overlay.append(osInput)
    spawnCommand.mockImplementation(async (cmd: string) => (
      cmd.includes('--set')
        ? { code: 1, stdout: '', stderr: 'denied\n' }
        : { code: 0, stdout: '', stderr: '' }
    ))

    const fab = mountFab(config, instance)
    fab.click()
    expect(fab.hasAttribute('disabled')).toBe(true)
    expect(showLoadingToast).toHaveBeenCalledTimes(1)
    expect(spawnCommand).not.toHaveBeenCalled()

    await paint()

    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('omk_save_error', 'Failed to save OMK OS & Boot Key'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    )
    expect(instance.close).not.toHaveBeenCalled()
    expect(fab.hasAttribute('disabled')).toBe(false)
  })

  it('rejects a malformed VB key without saving', async () => {
    const { config, instance } = await openTrustPage()
    const vbInput = document.createElement('input')
    vbInput.id = 'omk-vb-key'
    vbInput.value = 'not-a-key'
    instance.overlay.append(vbInput)

    mountFab(config, instance).click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes('--set'))).toBe(false)
    expect(showLoadingToast).not.toHaveBeenCalled()
    expect(instance.close).not.toHaveBeenCalled()
    expect(vbInput.getAttribute('aria-invalid')).toBe('true')
  })
})
