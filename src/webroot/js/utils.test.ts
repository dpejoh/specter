import { describe, expect, it, vi, beforeEach } from 'vitest'
import { escapeHtml, shellEscape, fetchJson } from './utils.js'

function mockFetch(data: unknown, status = 200) {
  globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status }))) as unknown as typeof globalThis.fetch
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('escapeHtml', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })

  it('coerces non-string input', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42')
  })
})

describe('shellEscape', () => {
  it('wraps simple string in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'")
  })

  it('handles embedded single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\"'\"'s'")
  })

  it('handles empty string', () => {
    expect(shellEscape('')).toBe("''")
  })
})



describe('fetchJson', () => {
  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network'))) as unknown as typeof globalThis.fetch
    const result = await fetchJson('http://example.com/data.json')
    expect(result).toBeNull()
  })

  it('returns null on non-ok response', async () => {
    mockFetch(null, 404)
    const result = await fetchJson('http://example.com/data.json')
    expect(result).toBeNull()
  })

  it('returns parsed JSON on success', async () => {
    mockFetch({ key: 'value' })
    const result = await fetchJson<{ key: string }>('http://example.com/data.json')
    expect(result).toEqual({ key: 'value' })
  })

  it('caches when ttlMs > 0', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ n: 1 }), { status: 200 })))
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch
    const r1 = await fetchJson('/test-cache.json', 60000)
    expect(r1).toEqual({ n: 1 })
    const r2 = await fetchJson('/test-cache.json', 60000)
    expect(r2).toEqual({ n: 1 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

