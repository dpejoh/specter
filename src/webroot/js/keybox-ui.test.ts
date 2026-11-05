import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, openKeyboxCatalogPage } = vi.hoisted(() => ({
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
  openKeyboxCatalogPage: vi.fn(),
}))

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./keybox-catalog-ui.js', () => ({ openKeyboxCatalogPage }))

import { openKeyboxPage } from './keybox-ui.js'

beforeEach(() => {
  openSubPage.mockClear()
  openKeyboxCatalogPage.mockClear()
})

describe('keybox page', () => {
  it('groups catalog and custom keybox actions under one entry', () => {
    void openKeyboxPage()

    const config = openSubPage.mock.calls[0]![0] as unknown as {
      title: string
      groups: { items: unknown[] }[]
    }
    const items = config.groups.flatMap(group => group.items)
    expect(config.title).toBe('Keybox')
    expect(items).toHaveLength(2)

    const instance = openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>
    return instance.then(({ overlay }) => {
      const container = overlay.firstElementChild as HTMLElement
      expect(container.querySelector('#keybox-install-row')).not.toBeNull()
      expect(container.querySelector('#keybox-custom-row')).not.toBeNull()
    })
  })

  it('opens the catalog from the install row', async () => {
    void openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const container = instance.overlay.firstElementChild as HTMLElement
    ;(container.querySelector('#keybox-install-row') as HTMLElement).click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(openKeyboxCatalogPage).toHaveBeenCalled()
  })
})
