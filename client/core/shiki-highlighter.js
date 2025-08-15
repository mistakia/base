import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

let highlighter_promise = null
const loaded_langs = new Set()
const loaded_themes = new Set()

const lang_import_map = {
  javascript: () => import('@shikijs/langs/javascript'),
  js: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  ts: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  xml: () => import('@shikijs/langs/xml'),
  markdown: () => import('@shikijs/langs/markdown'),
  md: () => import('@shikijs/langs/markdown'),
  yaml: () => import('@shikijs/langs/yaml'),
  yml: () => import('@shikijs/langs/yaml'),
  bash: () => import('@shikijs/langs/bash'),
  shell: () => import('@shikijs/langs/bash'),
  sh: () => import('@shikijs/langs/bash'),
  sql: () => import('@shikijs/langs/sql'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go')
}

const theme_import_map = {
  'github-dark': () => import('@shikijs/themes/github-dark'),
  'github-light': () => import('@shikijs/themes/github-light'),
  'solarized-light': () => import('@shikijs/themes/solarized-light'),
  'solarized-dark': () => import('@shikijs/themes/solarized-dark'),
  'dark-plus': () => import('@shikijs/themes/dark-plus'),
  'nord': () => import('@shikijs/themes/nord')
}

const get_highlighter = async () => {
  if (!highlighter_promise) {
    highlighter_promise = createHighlighterCore({
      themes: [],
      langs: [],
      engine: createJavaScriptRegexEngine()
    })
  }
  return highlighter_promise
}

const ensure_lang_loaded = async ({ lang }) => {
  if (!lang) return
  const normalized = String(lang).toLowerCase()
  if (loaded_langs.has(normalized)) return
  const importer = lang_import_map[normalized]
  if (typeof importer === 'function') {
    const highlighter = await get_highlighter()
    await highlighter.loadLanguage(importer())
    loaded_langs.add(normalized)
  }
}

const ensure_theme_loaded = async ({ theme }) => {
  if (!theme) return
  const normalized = String(theme)
  if (loaded_themes.has(normalized)) return
  const importer = theme_import_map[normalized]
  if (typeof importer === 'function') {
    const highlighter = await get_highlighter()
    await highlighter.loadTheme(importer())
    loaded_themes.add(normalized)
  }
}

export const code_to_html = async (
  code,
  { lang, theme, transformers } = {}
) => {
  await Promise.all([
    ensure_lang_loaded({ lang }),
    ensure_theme_loaded({ theme })
  ])
  const highlighter = await get_highlighter()
  return highlighter.codeToHtml(code || '', { lang, theme, transformers })
}


