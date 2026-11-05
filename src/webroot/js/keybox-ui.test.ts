import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, mountKeyboxCatalog, mountLocalKeyboxForm, catalogHandle, localHandle } = vi.hoisted(() => {
  const catalogHandle = {
    load: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    canInstall: vi.fn(() => true),
  }
  const localHandle = {
    apply: vi.fn(async () => true),
  }
  return {
    openSubPage: vi.fn((config: {
      headerAction?: (container: HTMLElement, instance: unknown) => void
      fab?: (container: HTMLElement, instance: unknown) => void
      groups: { items: { type?: string; render?: (container: HTMLElement, isEnabled: () => boolean, posClass?: string) => void }[] }[]
    }) => {
      const overlay = document.createElement('div')
      const pageHost = document.createElement('div')
      overlay.appendChild(pageHost)
      for (const group of config.groups) {
        for (const item of group.items) {
          if (item.type === 'custom') item.render?.(pageHost, () => true, '')
        }
      }
      const instance = { overlay, close: vi.fn(), isMasterEnabled: () => true }
      const header = document.createElement('div')
      const fab = document.createElement('div')
      overlay.appendChild(header)
      overlay.appendChild(fab)
      config.headerAction?.(header, instance)
      config.fab?.(fab, instance)
      return Promise.resolve(instance)
    }),
    mountKeyboxCatalog: vi.fn(() => catalogHandle),
    mountLocalKeyboxForm: vi.fn(async () => localHandle),
    catalogHandle,
    localHandle,
  }
})

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./keybox-catalog-ui.js', () => ({ mountKeyboxCatalog }))
vi.mock('./keybox-local-ui.js', () => ({ mountLocalKeyboxForm }))

import { openKeyboxPage } from './keybox-ui.js'

beforeEach(() => {
  openSubPage.mockClear()
  mountKeyboxCatalog.mockClear()
  mountLocalKeyboxForm.mockClear()
  catalogHandle.load.mockClear()
  catalogHandle.install.mockClear()
  catalogHandle.canInstall.mockClear()
  localHandle.apply.mockClear()
})

describe('keybox page', () => {
  it('combines remote and local sources in one page', async () => {
    await openKeyboxPage()

    const config = openSubPage.mock.calls[0]![0] as unknown as { title: string }
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const overlay = instance.overlay

    expect(config.title).toBe('Keybox')
    expect(overlay.querySelector('#kb-source-set')).not.toBeNull()
    expect(overlay.querySelector('#kb-remote-pane')).not.toBeNull()
    expect(overlay.querySelector('#kb-local-pane')).not.toBeNull()
    expect(overlay.querySelector('#kb-remote-pane')?.hasAttribute('hidden')).toBe(false)
    expect(overlay.querySelector('#kb-local-pane')?.hasAttribute('hidden')).toBe(true)
    expect(mountKeyboxCatalog).toHaveBeenCalled()
    expect(mountLocalKeyboxForm).toHaveBeenCalled()
    expect(catalogHandle.load).toHaveBeenCalled()
  })

  it('switches to the local form and applies it', async () => {
    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const overlay = instance.overlay

    const localButton = [...overlay.querySelectorAll('#kb-source-set md-outlined-segmented-button')]
      .find(button => button.getAttribute('value') === 'local') as HTMLElement
    localButton.click()

    expect(overlay.querySelector('#kb-remote-pane')?.hasAttribute('hidden')).toBe(true)
    expect(overlay.querySelector('#kb-local-pane')?.hasAttribute('hidden')).toBe(false)

    const fab = overlay.querySelector('#kb-fab') as HTMLElement & { label: string }
    expect(fab.label).toBe('Apply')
    fab.click()
    await Promise.resolve()
    expect(localHandle.apply).toHaveBeenCalled()
    expect(catalogHandle.install).not.toHaveBeenCalled()
  })

  it('installs from the remote catalog', async () => {
    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const overlay = instance.overlay
    const fab = overlay.querySelector('#kb-fab') as HTMLElement & { label: string }

    expect(fab.label).toBe('Install')
    fab.click()
    await Promise.resolve()
    expect(catalogHandle.install).toHaveBeenCalled()
    expect(localHandle.apply).not.toHaveBeenCalled()
  })
})
