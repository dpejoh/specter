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
})
