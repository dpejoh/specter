import { beforeEach, describe, expect, it } from 'vitest'
import { showConfirm, showErrorDialog } from './dialog.js'

beforeEach(() => {
  document.body.innerHTML = ''
  ;(HTMLElement.prototype as unknown as { show: () => void }).show = function (this: HTMLElement) {
    this.setAttribute('open', '')
  }
  ;(HTMLElement.prototype as unknown as { close: () => void }).close = function (this: HTMLElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('closed'))
  }
})

describe('dialog helpers', () => {
  it('resolves false when the confirm dialog is cancelled', async () => {
    const result = showConfirm('Delete?', 'This cannot be undone', { variant: 'danger' })
    const dialog = document.querySelector('md-dialog')!
    dialog.dispatchEvent(new Event('cancel'))
    await expect(result).resolves.toBe(false)
  })

  it('resolves true when the confirm button is pressed', async () => {
    const result = showConfirm('Delete?', 'This cannot be undone', { variant: 'danger' })
    const dialog = document.querySelector('md-dialog')!
    ;(dialog.querySelector('#dialog-confirm') as HTMLElement).click()
    await expect(result).resolves.toBe(true)
  })

  it('renders error output as text, not HTML', () => {
    showErrorDialog('Error', '<img src=x onerror=alert(1)>')
    expect(document.querySelector('#dialog-error-output')!.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(document.querySelector('#dialog-error-output img')).toBeNull()
  })

  it('uses a neutral confirm button for normal prompts', () => {
    showConfirm('Import anyway?', 'The file is missing fields')
    expect(document.querySelector('#dialog-confirm')!.classList.contains('danger-dialog-confirm')).toBe(false)
  })
})
