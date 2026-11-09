import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openSubPage, openKeyboxCatalogPage, mountLocalKeyboxForm, localHandle, pageState } = vi.hoisted(() => {
  const localHandle = {
    apply: vi.fn(async () => true),
  }
  const pageState = {
    hasValue: true,
    mountOptions: null as null | { onInstalled?: () => void; onValueChange?: (hasValue: boolean) => void },
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
    mountLocalKeyboxForm: vi.fn(async (_container: HTMLElement, options?: { onInstalled?: () => void; onValueChange?: (hasValue: boolean) => void }) => {
      pageState.mountOptions = options ?? null
      options?.onValueChange?.(pageState.hasValue)
      return localHandle
    }),
    localHandle,
    pageState,
  }
})

vi.mock('./subpage.js', () => ({ openSubPage }))
vi.mock('./keybox-catalog-ui.js', () => ({ openKeyboxCatalogPage }))
vi.mock('./keybox-local-ui.js', () => ({ mountLocalKeyboxForm }))

import { openKeyboxPage, wireKeybox } from './keybox-ui.js'

beforeEach(() => {
  document.body.innerHTML = ''
  openSubPage.mockClear()
  openKeyboxCatalogPage.mockClear()
  mountLocalKeyboxForm.mockReset()
  mountLocalKeyboxForm.mockImplementation(async (_container: HTMLElement, options?: { onInstalled?: () => void; onValueChange?: (hasValue: boolean) => void }) => {
    pageState.mountOptions = options ?? null
    options?.onValueChange?.(pageState.hasValue)
    return localHandle
  })
  pageState.hasValue = true
  pageState.mountOptions = null
  localHandle.apply.mockReset()
  localHandle.apply.mockResolvedValue(true)
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
    ;(instance.overlay.querySelector('#kb-remote-open') as HTMLElement)
      .dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }))
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

  it('keeps the apply button disabled while the local source is empty', async () => {
    pageState.hasValue = false

    await openKeyboxPage()

    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const apply = instance.overlay.querySelector('#kb-local-apply') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
  })

  it('shows a busy apply button until the install finishes', async () => {
    let release!: (value: boolean) => void
    localHandle.apply.mockReturnValueOnce(new Promise<boolean>(resolve => { release = resolve }))

    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    const apply = instance.overlay.querySelector('#kb-local-apply') as HTMLButtonElement

    expect(apply.disabled).toBe(false)
    apply.click()

    expect(apply.disabled).toBe(true)
    expect(apply.classList.contains('kb-install-btn--busy')).toBe(true)
    expect(apply.innerHTML).toContain('Installing…')

    release(false)

    await vi.waitFor(() => expect(apply.classList.contains('kb-install-btn--busy')).toBe(false))
    expect(apply.disabled).toBe(false)
    expect(apply.innerHTML).toContain('Install')
    expect(localHandle.apply).toHaveBeenCalledTimes(1)
  })

  it('closes the page when the local install succeeds', async () => {
    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement; close: ReturnType<typeof vi.fn> }>)

    pageState.mountOptions?.onInstalled?.()

    expect(instance.close).toHaveBeenCalledTimes(1)
  })

  it('ignores apply clicks when the form was not mounted', async () => {
    mountLocalKeyboxForm.mockResolvedValueOnce(null as never)

    await openKeyboxPage()
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>)
    ;(instance.overlay.querySelector('#kb-local-apply') as HTMLElement).click()
    await Promise.resolve()

    expect(localHandle.apply).not.toHaveBeenCalled()
  })

  it('does nothing when the keybox row is absent', () => {
    expect(() => wireKeybox()).not.toThrow()
    expect(openSubPage).not.toHaveBeenCalled()
  })

  it('opens the keybox page from the keybox button', async () => {
    const button = document.createElement('button')
    button.id = 'keybox-btn'
    document.body.appendChild(button)

    wireKeybox()
    button.click()

    await vi.waitFor(() => expect(openSubPage).toHaveBeenCalledTimes(1))
    expect(openSubPage.mock.calls[0]![0]).toEqual(expect.objectContaining({ id: 'keybox' }))
  })
})
