import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFilterDropdown } from './filter-dropdown.js'

beforeEach(() => {
  document.body.innerHTML = ''
})

function makeDropdown(onChange = vi.fn()) {
  const dropdown = createFilterDropdown({
    id: 'test-filter',
    ariaLabel: 'Filter keyboxes',
    value: 'active',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'all', label: 'All' },
    ],
    onChange,
  })
  document.body.appendChild(dropdown.element)
  return { dropdown, onChange }
}

describe('filter dropdown', () => {
  it('renders the selected label and opens the menu', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement

    expect(trigger.textContent).toContain('Active')
    expect(menu.hidden).toBe(true)

    trigger.click()

    expect(menu.hidden).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(dropdown.element.querySelectorAll('.filter-option')).toHaveLength(2)
    expect(dropdown.element.querySelector('.filter-option--selected')?.textContent).toContain('Active')
    expect(dropdown.element.querySelector('.filter-option--selected md-icon')).not.toBeNull()
  })

  it('selects an option and reports the change', () => {
    const { dropdown, onChange } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()

    const all = [...dropdown.element.querySelectorAll('.filter-option')]
      .find(option => option.textContent?.includes('All')) as HTMLButtonElement
    all.click()

    expect(onChange).toHaveBeenCalledWith('all')
    expect(trigger.textContent).toContain('All')
    expect((dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(true)
    dropdown.dispose()
  })


  it('does not close on touch-style focusout and still selects on click', () => {
    const { dropdown, onChange } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()

    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement
    const all = [...dropdown.element.querySelectorAll('.filter-option')]
      .find(option => option.textContent?.includes('All')) as HTMLButtonElement

    all.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    expect(menu.hidden).toBe(false)
    expect(onChange).not.toHaveBeenCalled()

    all.click()
    expect(onChange).toHaveBeenCalledWith('all')
    expect(trigger.textContent).toContain('All')
    expect(menu.hidden).toBe(true)
    dropdown.dispose()
  })

  it('closes on Tab without trapping focus', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement
    const first = dropdown.element.querySelector('.filter-option') as HTMLButtonElement
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(menu.hidden).toBe(true)
    dropdown.dispose()
  })

  it('updates options and value without losing the selected state', () => {
    const { dropdown } = makeDropdown()
    dropdown.setOptions([
      { value: 'active', label: 'Active' },
      { value: 'all', label: 'All' },
      { value: 'TAKR', label: 'TAKR' },
    ])
    dropdown.setValue('TAKR')

    expect(dropdown.getValue()).toBe('TAKR')
    expect((dropdown.element.querySelector('.filter-trigger') as HTMLElement).textContent).toContain('TAKR')
    expect(dropdown.element.querySelector('.filter-option--selected')?.textContent).toContain('TAKR')
  })

  it('closes another filter when one opens', () => {
    const first = makeDropdown()
    const second = makeDropdown()
    const firstTrigger = first.dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const secondTrigger = second.dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const firstMenu = first.dropdown.element.querySelector('.filter-menu') as HTMLElement
    const secondMenu = second.dropdown.element.querySelector('.filter-menu') as HTMLElement

    firstTrigger.click()
    expect(firstMenu.hidden).toBe(false)

    secondTrigger.click()
    expect(firstMenu.hidden).toBe(true)
    expect(secondMenu.hidden).toBe(false)
  })

  it('closes on Escape and outside pointer events', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement

    trigger.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu.hidden).toBe(true)

    trigger.click()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.hidden).toBe(true)
  })

  it('handles an empty option list and an unknown value', () => {
    const onChange = vi.fn()
    const dropdown = createFilterDropdown({
      id: 'empty-filter',
      ariaLabel: 'Empty filter',
      value: 'missing',
      options: [],
      onChange,
    })
    document.body.appendChild(dropdown.element)

    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const label = dropdown.element.querySelector('.filter-trigger-label') as HTMLElement
    expect(label.textContent).toBe('')
    expect(trigger.getAttribute('aria-label')).toBe('Empty filter:')
    expect(dropdown.getValue()).toBe('missing')

    trigger.click()
    expect((dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(false)
    expect(dropdown.element.querySelectorAll('.filter-option')).toHaveLength(0)
    trigger.click()

    dropdown.setOptions([])
    expect(dropdown.getValue()).toBe('')
    expect(label.textContent).toBe('')
    dropdown.dispose()
  })

  it('falls back to the first option when the value is not in the list', () => {
    const dropdown = createFilterDropdown({
      id: 'missing-filter',
      ariaLabel: 'Filter',
      value: 'gone',
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
      ],
      onChange: vi.fn(),
    })
    document.body.appendChild(dropdown.element)

    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    // The stored value is normalized with the displayed label immediately,
    // not only after a later setOptions() call.
    expect(dropdown.getValue()).toBe('one')
    expect(trigger.textContent).toContain('One')

    dropdown.setOptions([
      { value: 'two', label: 'Two' },
      { value: 'three', label: 'Three' },
    ])
    expect(dropdown.getValue()).toBe('two')
    expect(trigger.textContent).toContain('Two')
    dropdown.dispose()
  })

  it('normalizes a value that has no matching option when set directly', () => {
    const { dropdown } = makeDropdown()
    dropdown.setValue('missing')

    expect(dropdown.getValue()).toBe('active')
    expect(dropdown.element.querySelector('.filter-trigger')?.textContent).toContain('Active')
    dropdown.dispose()
  })

  it('toggles closed when the trigger is clicked twice', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement

    trigger.click()
    expect(menu.hidden).toBe(false)
    trigger.click()
    expect(menu.hidden).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    dropdown.dispose()
  })

  it('opens from the trigger with ArrowDown, Enter and Space', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement

    for (const key of ['ArrowDown', 'Enter', ' ']) {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      expect(menu.hidden).toBe(false)
      // Opening again while open is a no-op.
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      expect(menu.hidden).toBe(false)
      trigger.click()
      expect(menu.hidden).toBe(true)
    }
    dropdown.dispose()
  })

  it('moves through options with Arrow, Home and End keys', () => {
    const { dropdown } = makeDropdown()
    dropdown.setOptions([
      { value: 'active', label: 'Active' },
      { value: 'all', label: 'All' },
      { value: 'TAKR', label: 'TAKR' },
    ])
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()

    const options = () => [...dropdown.element.querySelectorAll<HTMLButtonElement>('.filter-option')]
    expect(document.activeElement).toBe(options()[0])

    options()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[1])
    expect(options()[1]!.tabIndex).toBe(0)

    options()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[2])

    options()[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[2])

    options()[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[1])

    options()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[0])

    options()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options()[0])

    dropdown.dispose()
  })

  it('closes on Escape and restores focus to the trigger', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()
    expect(document.activeElement).not.toBe(trigger)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect((dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
    dropdown.dispose()
  })

  it('does not report a change when the selected option is clicked again', () => {
    const { dropdown, onChange } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    trigger.click()

    const active = dropdown.element.querySelector('.filter-option--selected') as HTMLButtonElement
    active.click()
    expect(onChange).not.toHaveBeenCalled()
    expect((dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(true)
    dropdown.dispose()
  })

  it('closes when focus moves outside the dropdown', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    trigger.click()

    const option = dropdown.element.querySelector('.filter-option') as HTMLButtonElement
    option.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }))
    expect(menu.hidden).toBe(true)
    dropdown.dispose()
  })

  it('positions the menu at the end when it would overflow the viewport', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ right: window.innerWidth + 100 } as DOMRect)
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement

    trigger.click()
    expect(menu.style.insetInlineStart).toBe('auto')
    expect(menu.style.insetInlineEnd).toBe('0')

    dropdown.close()
    rect.mockReturnValue({ right: 10 } as DOMRect)
    trigger.click()
    expect(menu.style.insetInlineStart).toBe('0')
    expect(menu.style.insetInlineEnd).toBe('auto')

    dropdown.dispose()
    rect.mockRestore()
  })

  it('closes an open menu when the root is no longer connected', () => {
    const { dropdown } = makeDropdown()
    const trigger = dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    const menu = dropdown.element.querySelector('.filter-menu') as HTMLElement
    trigger.click()

    dropdown.element.remove()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.hidden).toBe(true)
    dropdown.dispose()
  })

  it('stops listening for other dropdowns after dispose', () => {
    const first = makeDropdown()
    const firstTrigger = first.dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    firstTrigger.click()

    const second = makeDropdown()
    first.dropdown.dispose()
    expect((first.dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(true)

    const secondTrigger = second.dropdown.element.querySelector('.filter-trigger') as HTMLButtonElement
    secondTrigger.click()
    expect((second.dropdown.element.querySelector('.filter-menu') as HTMLElement).hidden).toBe(false)
    second.dropdown.dispose()
  })
})
