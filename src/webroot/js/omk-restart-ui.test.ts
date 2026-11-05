import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, runAction } = vi.hoisted(() => ({
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
}))

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./actions.js', () => ({ runAction }))
vi.mock('./bridge.js', () => ({ exec: vi.fn(), getModuleDir: () => '/data/adb/modules/specter' }))
vi.mock('./toast.js', () => ({ showToast: vi.fn() }))

import { openOmkRestartPage } from './omk-trust-ui.js'

beforeEach(() => {
  openSubPage.mockClear()
  runAction.mockClear()
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
