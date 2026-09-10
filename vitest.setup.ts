const store = new Map<string, string>()

const mockStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
}

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })
}
