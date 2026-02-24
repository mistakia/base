import { spawn } from 'child_process'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { load_search_config } from './search-config.mjs'

const log = debug('search:ripgrep')

const escape_regex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Resolve search directory, handling both absolute and relative paths
 *
 * @param {string} user_base_dir - Base directory for user files
 * @param {string|null} directory - Directory to search (absolute or relative)
 * @returns {string} Resolved directory path
 */
function resolve_search_directory(user_base_dir, directory) {
  const normalized_base = path.normalize(user_base_dir)

  if (!directory) {
    return normalized_base
  }

  // Join and normalize the path (handles both absolute and relative)
  const joined_path = path.isAbsolute(directory)
    ? path.normalize(directory)
    : path.normalize(path.join(normalized_base, directory))

  // Validate the resolved path is within the base directory
  if (
    joined_path === normalized_base ||
    joined_path.startsWith(normalized_base + path.sep)
  ) {
    return joined_path
  }

  // Fall back to user_base_dir for paths outside the allowed directory
  log(
    `Directory ${directory} is outside user_base_dir, using ${normalized_base}`
  )
  return normalized_base
}

/**
 * Execute ripgrep command with timeout protection
 *
 * @param {Object} params - Parameters
 * @param {string[]} params.args - Ripgrep arguments
 * @param {string} params.cwd - Working directory
 * @param {number} params.timeout_ms - Timeout in milliseconds
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function execute_ripgrep({ args, cwd, timeout_ms = 30000 }) {
  return new Promise((resolve, reject) => {
    log(`Executing: rg ${args.join(' ')} in ${cwd}`)

    const rg_process = spawn('rg', args, { cwd })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      settled = true
      rg_process.kill('SIGTERM')
      reject(new Error('Ripgrep search timed out'))
    }, timeout_ms)

    rg_process.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    rg_process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    rg_process.on('close', (code) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      // Ripgrep exits with code 1 when no matches found, which is not an error
      if (code === 0 || code === 1) {
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`Ripgrep failed with code ${code}: ${stderr}`))
      }
    })

    rg_process.on('error', (error) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      reject(new Error(`Failed to execute ripgrep: ${error.message}`))
    })
  })
}

/**
 * Build ripgrep arguments from configuration and options
 *
 * @param {Object} params - Parameters
 * @param {string} params.pattern - Search pattern
 * @param {Object} params.rg_config - Ripgrep configuration
 * @param {Object} params.options - Search options
 * @returns {string[]} Ripgrep arguments
 */
function build_ripgrep_args({ pattern, rg_config, options }) {
  const {
    files_only = false,
    paths_only = false,
    include_line_numbers = false,
    case_sensitive = false,
    file_types = [],
    directory = null
  } = options

  // For multi-word queries, convert to regex pattern that matches words in sequence
  // "transition secure" -> "transition.*secure" (matches both words on same line)
  const words = pattern.trim().split(/\s+/).map(escape_regex)
  const search_pattern =
    words.length > 1 ? words.join('.*') : escape_regex(pattern)

  const args = [search_pattern]

  // Output format
  if (paths_only || files_only) {
    args.push('--files-with-matches')
  } else {
    args.push('--no-heading')
    if (include_line_numbers) {
      args.push('--line-number')
    }
  }

  // Case sensitivity
  args.push(case_sensitive ? '--case-sensitive' : '--ignore-case')

  // File size limit
  if (rg_config.max_filesize) {
    args.push('--max-filesize', rg_config.max_filesize)
  }

  // Exclude patterns from config
  for (const exclude_pattern of rg_config.exclude_patterns || []) {
    args.push('--glob', `!${exclude_pattern}`)
  }

  // Hidden files
  if (!rg_config.include_hidden) {
    args.push('--no-hidden')
  }

  // Symlinks
  if (rg_config.follow_symlinks) {
    args.push('--follow')
  }

  // File type filters
  for (const file_type of file_types) {
    args.push('--type', file_type)
  }

  // Directory scope - use '.' if no directory specified (search cwd)
  args.push(directory || '.')

  return args
}

/**
 * Parse ripgrep output into structured results
 *
 * @param {Object} params - Parameters
 * @param {string} params.output - Ripgrep stdout
 * @param {string} params.base_dir - Base directory for relative paths
 * @param {boolean} params.paths_only - Whether output is paths only
 * @param {boolean} params.include_line_numbers - Whether line numbers are included
 * @returns {Array<Object>} Parsed results
 */
function parse_ripgrep_output({
  output,
  base_dir,
  paths_only = false,
  include_line_numbers = false
}) {
  if (!output.trim()) {
    return []
  }

  const lines = output.trim().split('\n')
  const results = []

  for (const line of lines) {
    if (!line.trim()) continue

    let file_path, line_number, match_content

    if (paths_only) {
      file_path = line.trim()
    } else if (include_line_numbers) {
      // Format: file:line:content
      const match = line.match(/^([^:]+):(\d+):(.*)$/)
      if (match) {
        file_path = match[1]
        line_number = parseInt(match[2], 10)
        match_content = match[3]
      }
    } else {
      // Format: file:content
      const colon_index = line.indexOf(':')
      if (colon_index > 0) {
        file_path = line.substring(0, colon_index)
        match_content = line.substring(colon_index + 1)
      } else {
        file_path = line
      }
    }

    if (file_path) {
      const result = {
        file_path: file_path.startsWith(base_dir)
          ? path.relative(base_dir, file_path)
          : file_path,
        absolute_path: file_path.startsWith('/')
          ? file_path
          : path.join(base_dir, file_path),
        type: 'file'
      }

      if (line_number !== undefined) {
        result.line_number = line_number
      }

      if (match_content !== undefined) {
        result.match_content = match_content.trim()
      }

      results.push(result)
    }
  }

  return results
}

/**
 * Search file contents using ripgrep
 *
 * @param {Object} params - Search parameters
 * @param {string} params.pattern - Search pattern
 * @param {string} [params.directory] - Optional directory to scope search
 * @param {boolean} [params.paths_only=false] - Return only file paths
 * @param {boolean} [params.include_line_numbers=false] - Include line numbers in results
 * @param {boolean} [params.case_sensitive=false] - Case sensitive search
 * @param {number} [params.max_results=100] - Maximum results to return
 * @param {string[]} [params.file_types] - File types to search (e.g., 'md', 'js')
 * @returns {Promise<Array<Object>>} Search results
 */
export async function search_file_contents({
  pattern,
  directory = null,
  paths_only = false,
  include_line_numbers = false,
  case_sensitive = false,
  max_results = 100,
  file_types = []
}) {
  if (!pattern || !pattern.trim()) {
    return []
  }

  const search_config = await load_search_config()
  const rg_config = search_config.ripgrep || {}

  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const cwd = resolve_search_directory(user_base_dir, directory)

  const args = build_ripgrep_args({
    pattern,
    rg_config,
    options: {
      paths_only,
      include_line_numbers,
      case_sensitive,
      file_types
    }
  })

  try {
    const result = await execute_ripgrep({
      args,
      cwd,
      timeout_ms: search_config.search?.timeout_ms || 10000
    })

    const results = parse_ripgrep_output({
      output: result.stdout,
      base_dir: user_base_dir,
      paths_only,
      include_line_numbers
    })

    // Apply max_results limit
    return results.slice(0, max_results)
  } catch (error) {
    log(`Content search failed: ${error.message}`)
    return []
  }
}

/**
 * Build ripgrep args for file listing with common config options
 *
 * @param {Object} rg_config - Ripgrep configuration
 * @returns {string[]} Base ripgrep arguments for file listing
 */
function build_file_list_args(rg_config) {
  const args = ['--files']

  // Exclude patterns from config
  for (const exclude_pattern of rg_config.exclude_patterns || []) {
    args.push('--glob', `!${exclude_pattern}`)
  }

  // Hidden files
  if (!rg_config.include_hidden) {
    args.push('--no-hidden')
  }

  // Symlinks
  if (rg_config.follow_symlinks) {
    args.push('--follow')
  }

  return args
}

/**
 * Parse ripgrep file list output into structured results
 *
 * @param {Object} params - Parameters
 * @param {string} params.stdout - Ripgrep stdout
 * @param {string} params.user_base_dir - User base directory
 * @param {string} params.cwd - Current working directory
 * @param {number} params.max_results - Maximum results to return
 * @returns {Array<Object>} Parsed file results
 */
function parse_file_list_output({ stdout, user_base_dir, cwd, max_results }) {
  const paths = stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, max_results)

  return paths.map((file_path) => ({
    file_path: file_path.startsWith(user_base_dir)
      ? path.relative(user_base_dir, file_path)
      : file_path,
    absolute_path: file_path.startsWith('/')
      ? file_path
      : path.join(cwd, file_path),
    type: 'file'
  }))
}

/**
 * Get all file paths without filtering (for fuzzy scoring)
 *
 * Following VS Code's approach: collect all files first, then score and limit.
 * VS Code uses DEFAULT_MAX_SEARCH_RESULTS = 20000 internally.
 *
 * @param {Object} params - Search parameters
 * @param {string} [params.directory] - Optional directory to scope search
 * @param {number} [params.max_results=20000] - Maximum results to return (high limit, scoring happens after)
 * @returns {Promise<Array<Object>>} All file paths
 */
export async function search_all_file_paths({
  directory = null,
  max_results = 20000
} = {}) {
  const search_config = await load_search_config()
  const rg_config = search_config.ripgrep || {}

  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const cwd = resolve_search_directory(user_base_dir, directory)
  const args = build_file_list_args(rg_config)

  try {
    const result = await execute_ripgrep({
      args,
      cwd,
      timeout_ms: search_config.search?.timeout_ms || 30000
    })

    return parse_file_list_output({
      stdout: result.stdout,
      user_base_dir,
      cwd,
      max_results
    })
  } catch (error) {
    log(`All paths search failed: ${error.message}`)
    return []
  }
}

/**
 * Check if ripgrep is available on the system
 *
 * @returns {Promise<boolean>} True if ripgrep is available
 */
export async function check_ripgrep_availability() {
  try {
    const rg_process = spawn('rg', ['--version'])
    return new Promise((resolve) => {
      rg_process.on('close', (code) => {
        resolve(code === 0)
      })
      rg_process.on('error', () => {
        resolve(false)
      })
    })
  } catch (error) {
    return false
  }
}

/**
 * Search file contents using ripgrep --json for structured match data with context.
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string} [params.directory] - Optional directory to scope search
 * @param {number} [params.context_lines=2] - Lines of context before and after match
 * @param {number} [params.max_results=50] - Maximum match results to return
 * @returns {Promise<Array<{file_path: string, relative_path: string, line_number: number, match_line: string, context_before: string[], context_after: string[]}>>}
 */
export async function search_file_contents_with_context({
  query,
  directory = null,
  context_lines = 2,
  max_results = 50
}) {
  if (!query || !query.trim()) {
    return []
  }

  const search_config = await load_search_config()
  const rg_config = search_config.ripgrep || {}

  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const cwd = resolve_search_directory(user_base_dir, directory)

  const words = query.trim().split(/\s+/).map(escape_regex)
  const search_pattern =
    words.length > 1 ? words.join('.*') : escape_regex(query)

  // Limit ripgrep output to bound memory usage; multiply by context factor
  // since context lines add output but don't count as separate matches
  const max_count = max_results * 3

  const args = [
    search_pattern,
    '--json',
    '--ignore-case',
    '-C',
    String(context_lines),
    '--max-count',
    String(max_count)
  ]

  if (rg_config.max_filesize) {
    args.push('--max-filesize', rg_config.max_filesize)
  }

  for (const exclude_pattern of rg_config.exclude_patterns || []) {
    args.push('--glob', `!${exclude_pattern}`)
  }

  if (!rg_config.include_hidden) {
    args.push('--no-hidden')
  }

  if (rg_config.follow_symlinks) {
    args.push('--follow')
  }

  args.push('.')

  try {
    const result = await execute_ripgrep({
      args,
      cwd,
      timeout_ms: search_config.search?.timeout_ms || 10000
    })

    return parse_ripgrep_json_output({
      output: result.stdout,
      base_dir: user_base_dir,
      cwd,
      max_results
    })
  } catch (error) {
    log('Content search with context failed: %s', error.message)
    return []
  }
}

/**
 * Parse ripgrep --json output into structured match results with context.
 *
 * @param {Object} params
 * @param {string} params.output - Raw ripgrep JSON lines output
 * @param {string} params.base_dir - Base directory for relative paths
 * @param {string} params.cwd - Current working directory
 * @param {number} params.max_results - Maximum results
 * @returns {Array<Object>} Parsed match results
 */
function parse_ripgrep_json_output({ output, base_dir, cwd, max_results }) {
  if (!output.trim()) return []

  const lines = output.trim().split('\n')

  // First pass: collect all entries in order
  const entries = []
  for (const line of lines) {
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (parsed.type !== 'match' && parsed.type !== 'context') continue

    const data = parsed.data
    const raw_path = data.path?.text
    if (!raw_path) continue

    const absolute_path = path.isAbsolute(raw_path)
      ? raw_path
      : path.join(cwd, raw_path)
    const relative_path = absolute_path.startsWith(base_dir)
      ? path.relative(base_dir, absolute_path)
      : raw_path

    entries.push({
      type: parsed.type,
      file_path: absolute_path,
      relative_path,
      line_number: data.line_number,
      text: (data.lines?.text || '').trimEnd()
    })
  }

  // Second pass: group context lines around matches
  const results = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.type !== 'match') continue

    const context_before = []
    const context_after = []

    // Look backwards for context lines in the same file
    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j]
      if (prev.type !== 'context' || prev.relative_path !== entry.relative_path)
        break
      context_before.unshift(prev.text)
    }

    // Look forwards for context lines in the same file
    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j]
      if (next.type !== 'context' || next.relative_path !== entry.relative_path)
        break
      context_after.push(next.text)
    }

    results.push({
      file_path: entry.file_path,
      relative_path: entry.relative_path,
      line_number: entry.line_number,
      match_line: entry.text,
      context_before,
      context_after
    })

    if (results.length >= max_results) break
  }

  return results
}

export default {
  search_file_contents,
  search_file_contents_with_context,
  search_all_file_paths,
  check_ripgrep_availability
}
