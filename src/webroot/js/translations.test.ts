import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const WEBROOT = resolve(__dirname, '..')
const LANG_DIR = resolve(WEBROOT, 'lang')
const SOURCE_FILE = resolve(LANG_DIR, 'source/string.json')

interface TranslationReport {
  lang: string
  missing: string[]
  stale: string[]
  empty: string[]
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
    return { lang, missing: sourceKeys, stale: [], empty: [], totalKeys: 0 }
  }

  const trans = loadJson(filePath)
  const transKeys = Object.keys(trans)

  return {
    lang,
    missing: sourceKeys.filter(k => !(k in trans)),
    stale: transKeys.filter(k => !(k in source)),
    empty: sourceKeys.filter(k => k in trans && !String(trans[k]).trim()),
    totalKeys: transKeys.length,
  }
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

/** Literal i18n keys referenced by the UI (tests excluded). */
function usedKeys(): string[] {
  const files = [
    ...walk(resolve(WEBROOT, 'js')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')),
    resolve(WEBROOT, 'index.html'),
  ]
  const keys = new Set<string>()
  const callRe = /\b(?:t|tf|getTranslation)\(\s*(['"])([^'"]+)\1(?!\s*\+)/g
  const dataRe = /data-i18n(?:-aria|-placeholder|-title)?="([^"]+)"/g
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(callRe)) keys.add(match[2]!)
    for (const match of text.matchAll(dataRe)) keys.add(match[1]!)
  }
  return [...keys]
}

const PLACEHOLDER = /\{[^}]+\}/g
const sentence = (value: string) => value.trim().split(/\s+/).length >= 3

/** Values that are legitimately the same in every language. */
const UNTRANSLATED_OK = new Set([
  'app_title', 'menu_keybox', 'menu_pif_canary', 'menu_pif_title',
  'keybox_info_keybox_section', 'keybox_info_rkp', 'theme_mode_amoled',
  'sp_placeholder',
])

const LANGS = ['ar', 'es', 'fr', 'hu', 'id', 'pl', 'ru', 'tr', 'vn', 'zh']

describe('translations', () => {
  const reports = LANGS.map(report)
  const source = loadJson(SOURCE_FILE)

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

  it.each(reports)('$lang has no empty translations', (r: TranslationReport) => {
    expect(r.empty).toEqual([])
  })

  it.each(reports)('$lang keeps every placeholder', (r: TranslationReport) => {
    const trans = loadJson(resolve(LANG_DIR, `${r.lang}.json`))
    const broken = Object.keys(source).filter(key => {
      const expected = (source[key]!.match(PLACEHOLDER) || []).sort()
      const actual = (String(trans[key] ?? '').match(PLACEHOLDER) || []).sort()
      return JSON.stringify(expected) !== JSON.stringify(actual)
    })
    expect(broken).toEqual([])
  })

  it.each(reports)('$lang translates sentence-length values', (r: TranslationReport) => {
    const trans = loadJson(resolve(LANG_DIR, `${r.lang}.json`))
    const untranslated = Object.keys(source).filter(key =>
      !UNTRANSLATED_OK.has(key) &&
      sentence(source[key]!) &&
      String(trans[key] ?? '').trim() === source[key]!.trim(),
    )
    expect(untranslated).toEqual([])
  })

  it('every key used by the UI exists in the source pack', () => {
    const sourceKeys = new Set(Object.keys(source))
    expect(usedKeys().filter(key => !sourceKeys.has(key))).toEqual([])
  })
})
