import { describe, expect, it, beforeEach } from 'vitest'
import { getGlobal, setGlobal, deleteGlobal } from './utils.js'

beforeEach(() => {
  for (const key of Object.keys(window)) {
    if (key.startsWith('__test_')) deleteGlobal(key)
  }
})

describe('window-global', () => {
  it('getGlobal returns undefined for unknown key', () => {
    expect(getGlobal('__test_nonexistent')).toBeUndefined()
  })

  it('setGlobal stores a value and getGlobal retrieves it', () => {
    setGlobal('__test_foo', 42)
    expect(getGlobal<number>('__test_foo')).toBe(42)
  })

  it('setGlobal stores an object', () => {
    const obj = { a: 1, b: 'hello' }
    setGlobal('__test_obj', obj)
    expect(getGlobal<typeof obj>('__test_obj')).toEqual(obj)
  })

  it('setGlobal stores a function', () => {
    const fn = () => 'result'
    setGlobal('__test_fn', fn)
    const retrieved = getGlobal<() => string>('__test_fn')
    expect(retrieved!()).toBe('result')
  })

  it('deleteGlobal removes a stored value', () => {
    setGlobal('__test_del', 'value')
    expect(getGlobal('__test_del')).toBe('value')
    deleteGlobal('__test_del')
    expect(getGlobal('__test_del')).toBeUndefined()
  })

  it('deleteGlobal on missing key does not throw', () => {
    expect(() => deleteGlobal('__test_nonexistent')).not.toThrow()
  })
})
