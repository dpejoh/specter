import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, runAction, exec } = vi.hoisted(() => ({
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
}))

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./actions.js', () => ({ runAction }))
vi.mock('./bridge.js', () => ({ exec, getModuleDir: () => '/data/adb/modules/specter' }))
vi.mock('./toast.js', () => ({ showToast: vi.fn() }))

import { openOmkRestartPage, openOmkTrustPage } from './omk-trust-ui.js'

beforeEach(() => {
  openSubPage.mockClear()
  runAction.mockClear()
  exec.mockReset()
  exec.mockImplementation(async () => ({ code: 0, stdout: '', stderr: '' }))
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

    ;(container.querySelector('#omk-restart-keymint-row') as HTMLElement).click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runAction).toHaveBeenCalledWith('omk_restart_keymint.sh', 'tools_restart_omk_keymint')

    runAction.mockClear()
    ;(container.querySelector('#omk-restart-injector-row') as HTMLElement).click()
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
      value: '15',
      placeholder: 'auto',
    })
    expect(items[1]).toMatchObject({
      type: 'input',
      id: 'omk-vb-key',
      layout: 'block',
      value: 'auto',
      maxLength: 64,
      mono: true,
    })
    expect(config.fab).toBeTypeOf('function')
  })

  it('saves both values and closes the subpage', async () => {
    const { config, instance } = await openTrustPage()
    const osInput = document.createElement('input')
    osInput.id = 'omk-os-version'
    osInput.value = '16'
    const vbInput = document.createElement('input')
    vbInput.id = 'omk-vb-key'
    vbInput.value = 'auto'
    instance.overlay.append(osInput, vbInput)

    mountFab(config, instance).click()
    await new Promise(resolve => setTimeout(resolve, 0))

    const commands = exec.mock.calls.map(([cmd]) => String(cmd))
    expect(commands.some(cmd => cmd.includes('--set') && cmd.includes('os_version=16') && cmd.includes('vb_key=auto'))).toBe(true)
    expect(commands.some(cmd => cmd.includes('refresh_desc.sh'))).toBe(true)
    expect(instance.close).toHaveBeenCalled()
  })

  it('rejects a malformed VB key without saving', async () => {
    const { config, instance } = await openTrustPage()
    const vbInput = document.createElement('input')
    vbInput.id = 'omk-vb-key'
    vbInput.value = 'not-a-key'
    instance.overlay.append(vbInput)

    mountFab(config, instance).click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('--set'))).toBe(false)
    expect(instance.close).not.toHaveBeenCalled()
    expect(vbInput.getAttribute('aria-invalid')).toBe('true')
  })
})
