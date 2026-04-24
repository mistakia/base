import { spawn } from 'child_process'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { load_search_config } from '#libs-server/search/search-config.mjs'
import { is_path_within_directory } from '#libs-server/utils/is-path-within-directory.mjs'

const log = debug('files:list-file-paths')

async function execute_ripgrep({ args, cwd, timeout_ms }) {
  return new Promise((resolve, reject) => {
    const rg_process = spawn('rg', args, { cwd })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      settled = true
      rg_process.kill('SIGTERM')
      reject(new Error('Ripgrep file listing timed out'))
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

function build_file_list_args(rg_config) {
  const args = ['--files']

  for (const exclude_pattern of rg_config.exclude_patterns || []) {
    args.push('--glob', `!${exclude_pattern}`)
  }

  if (!rg_config.include_hidden) {
    args.push('--no-hidden')
  }

  if (rg_config.follow_symlinks) {
    args.push('--follow')
  }

  return args
}

function parse_file_list_output({ stdout, user_base_dir, cwd, max_results }) {
  const paths = stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, max_results)

  return paths.map((raw_path) => {
    const absolute_path = path.isAbsolute(raw_path)
      ? raw_path
      : path.join(cwd, raw_path)
    return {
      file_path: path.relative(user_base_dir, absolute_path),
      absolute_path,
      type: 'file'
    }
  })
}

/**
 * Enumerate file paths under an absolute directory using ripgrep.
 *
 * @param {Object} [params]
 * @param {string|null} [params.resolved_directory_path] - Absolute directory
 *   to enumerate. When null, defaults to user_base_directory. Must be within
 *   user_base_directory.
 * @param {number} [params.max_results=20000] - Max paths to return.
 * @param {string} [params.user_base_directory] - Override for the user base
 *   directory (primarily used by tests).
 * @returns {Promise<Array<{file_path: string, absolute_path: string, type: 'file'}>>}
 */
export async function list_file_paths({
  resolved_directory_path = null,
  max_results = 20000,
  user_base_directory = null
} = {}) {
  const search_config = await load_search_config()
  const rg_config = search_config.ripgrep || {}

  const user_base_dir =
    user_base_directory ||
    config.user_base_directory ||
    process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const normalized_base = path.normalize(user_base_dir)
  let cwd = normalized_base
  if (resolved_directory_path) {
    const normalized_cwd = path.normalize(resolved_directory_path)
    if (!path.isAbsolute(normalized_cwd)) {
      throw new Error(
        `resolved_directory_path must be absolute; got: ${resolved_directory_path}`
      )
    }
    if (!is_path_within_directory(normalized_cwd, normalized_base)) {
      throw new Error(
        `resolved_directory_path is outside user_base_directory: ${resolved_directory_path}`
      )
    }
    cwd = normalized_cwd
  }

  const args = build_file_list_args(rg_config)

  try {
    const result = await execute_ripgrep({
      args,
      cwd,
      timeout_ms: search_config.search?.timeout_ms || 30000
    })

    return parse_file_list_output({
      stdout: result.stdout,
      user_base_dir: normalized_base,
      cwd,
      max_results
    })
  } catch (error) {
    log(`list_file_paths failed: ${error.message}`)
    return []
  }
}

export default { list_file_paths }
