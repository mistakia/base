import { readFile } from 'fs/promises'
import path from 'path'

import frontMatter from 'front-matter'

import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

let cached_config = null
let compiled_patterns = null

/**
 * Load sensitive pattern configuration from JSON config file.
 * Caches on first load.
 * @param {string} [config_path] - Override path to config file
 * @returns {object} Parsed config object
 */
export async function load_pattern_config(config_path = null) {
  if (cached_config) {
    return cached_config
  }

  const resolved_path =
    config_path ||
    path.join(get_user_base_directory(), 'config', 'sensitive-patterns.json')

  const raw = await readFile(resolved_path, 'utf8')
  cached_config = JSON.parse(raw)
  compiled_patterns = compile_patterns(cached_config)
  return cached_config
}

/**
 * Pre-compile all regex patterns from config for reuse across scans
 */
function compile_patterns(config) {
  const patterns = []
  for (const [category_name, category_data] of Object.entries(
    config.categories
  )) {
    for (const pattern_def of category_data.patterns) {
      const base_flags = pattern_def.flags || ''
      const flags = base_flags.includes('g') ? base_flags : base_flags + 'g'
      patterns.push({
        regex: new RegExp(pattern_def.pattern, flags),
        name: pattern_def.name,
        category: category_name,
        description: pattern_def.description
      })
    }
  }
  return patterns
}

/**
 * Clear the cached config (useful for testing)
 */
export function clear_pattern_cache() {
  cached_config = null
  compiled_patterns = null
}

/**
 * Scan file content against configured regex patterns.
 *
 * For markdown files, YAML frontmatter is stripped before scanning to avoid
 * false positives from entity_ids, URIs, and relations metadata.
 *
 * @param {object} options
 * @param {string} [options.file_path] - Path to file to scan (reads file if content not provided)
 * @param {string} [options.content] - Direct content to scan (skips file read)
 * @param {string} [options.config_path] - Override path to pattern config
 * @returns {Promise<{findings: Array, file_type: string, lines_scanned: number}>}
 */
export async function scan_file_content({
  file_path = null,
  content = null,
  config_path = null
} = {}) {
  if (!content && !file_path) {
    throw new Error('Either file_path or content must be provided')
  }

  if (!content) {
    content = await readFile(file_path, 'utf8')
  }

  await load_pattern_config(config_path)
  const file_type = detect_file_type(file_path)

  // Strip frontmatter for markdown files
  let scannable_content = content
  if (file_type === 'markdown') {
    try {
      scannable_content = frontMatter(content).body
    } catch {
      // If frontmatter parsing fails, scan full content
      scannable_content = content
    }
  }

  const lines = scannable_content.split('\n')
  const findings = []

  for (const pattern of compiled_patterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let match
      pattern.regex.lastIndex = 0
      while ((match = pattern.regex.exec(line)) !== null) {
        findings.push({
          line: line.trim(),
          line_number: i + 1,
          pattern_name: pattern.name,
          category: pattern.category,
          matched_text: match[0],
          description: pattern.description
        })
        // Prevent infinite loops on zero-length matches
        if (match[0].length === 0) {
          pattern.regex.lastIndex++
        }
      }
    }
  }

  return {
    findings,
    file_type,
    lines_scanned: lines.length
  }
}

/**
 * Detect file type from extension
 * @param {string|null} file_path
 * @returns {string} 'markdown', 'json', 'jsonl', or 'unknown'
 */
function detect_file_type(file_path) {
  if (!file_path) return 'unknown'

  const ext = path.extname(file_path).toLowerCase()
  switch (ext) {
    case '.md':
    case '.markdown':
      return 'markdown'
    case '.json':
      return 'json'
    case '.jsonl':
      return 'jsonl'
    default:
      return 'unknown'
  }
}
