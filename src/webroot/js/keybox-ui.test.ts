import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, openKeyboxCatalogPage, mountLocalKeyboxForm, localHandle } = vi.hoisted(() => {
  const localHandle = {
    apply: vi.fn(async () => true),
  }
  return {
    openSubPage: vi.fn((config: {
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
      return Promise.resolve({ overlay, close: vi.fn(), isMasterEnabled: () => true })
    }),
    openKeyboxCatalogPage: vi.fn(),
    mountLocalKeyboxForm: vi.fn(async (_container: HTMLElement, options?: { onValueChange?: (hasValue: boolean) => void }) => {
      options?.onValueChange?.(true)
      return localHandle
    }),
    localHandle,
  }
})

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./keybox-catalog-ui.js', () => ({ openKeyboxCatalogPage }))
vi.mock('./keybox-local-ui.js', () => ({ mountLocalKeyboxForm }))

import { openKeyboxPage } from './keybox-ui.js'

beforeEach(() => {
  openSubPage.mockClear()
  openKeyboxCatalogPage.mockClear()
  mountLocalKeyboxForm.mockClear()
  localHandle.apply.mockClear()
})

describe('keybox page', () => {
  it('shows remote and local sections on one page', async () => {
    await openKeyboxPage()

    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const overlay = instance.overlay
    const headings = [...overlay.querySelectorAll('.list-title')].map(h => h.textContent?.trim())

    expect(headings).toEqual(['Specter source', 'Custom source'])
    expect(overlay.querySelector('#kb-remote-open')).not.toBeNull()
    expect(overlay.querySelector('#kb-local-content')).not.toBeNull()
    expect(overlay.querySelector('#kb-local-apply')).not.toBeNull()
    expect(mountLocalKeyboxForm).toHaveBeenCalled()
  })

  it('opens the remote keybox page', async () => {
    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    ;(instance.overlay.querySelector('#kb-remote-open') as HTMLElement).click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(openKeyboxCatalogPage).toHaveBeenCalled()
  })

  it('applies the inline local form', async () => {
    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    ;(instance.overlay.querySelector('#kb-local-apply') as HTMLElement).click()
    await Promise.resolve()
    expect(localHandle.apply).toHaveBeenCalled()
  })
})
