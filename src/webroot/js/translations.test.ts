import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const LANG_DIR = resolve(__dirname, '../lang')
const SOURCE_FILE = resolve(LANG_DIR, 'source/string.json')

interface TranslationReport {
  lang: string
  missing: string[]
  stale: string[]
  totalKeys: number
}

function loadJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function report(lang: string): TranslationReport {
  const source = loadJson(SOURCE_FILE)
  const sourceKeys = Object.keys(source)

  const filePath = resolve(LANG_DIR, `${lang}.json`)
  if (!existsSync(filePath)) {
    return { lang, missing: sourceKeys, stale: [], totalKeys: 0 }
  }

  const trans = loadJson(filePath)
  const transKeys = Object.keys(trans)

  return {
    lang,
    missing: sourceKeys.filter(k => !(k in trans)),
    stale: transKeys.filter(k => !(k in source)),
    totalKeys: transKeys.length,
  }
}

const LANGS = ['ar', 'es', 'ru', 'zh']

describe('translations', () => {
  const reports = LANGS.map(report)

  it.each(reports)('$lang has all required keys', (r: TranslationReport) => {
    if (r.missing.length > 0) {
      console.warn(`[${r.lang}] Missing ${r.missing.length} keys:\n  ${r.missing.join('\n  ')}`)
    }
    expect(r.missing).toEqual([])
  })

  it.each(reports)('$lang has no stale keys', (r: TranslationReport) => {
    if (r.stale.length > 0) {
      console.warn(`[${r.lang}] Stale ${r.stale.length} keys:\n  ${r.stale.join('\n  ')}`)
    }
    expect(r.stale).toEqual([])
  })
})
