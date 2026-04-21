import { spawn } from 'child_process'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { load_search_config } from '#libs-server/search/search-config.mjs'

const log = debug('files:list-file-paths')

function resolve_search_directory(user_base_dir, directory) {
  const normalized_base = path.normalize(user_base_dir)

  if (!directory) {
    return normalized_base
  }

  const joined_path = path.isAbsolute(directory)
    ? path.normalize(directory)
    : path.normalize(path.join(normalized_base, directory))

  if (
    joined_path === normalized_base ||
    joined_path.startsWith(normalized_base + path.sep)
  ) {
    return joined_path
  }

  log(
    `Directory ${directory} is outside user_base_dir, using ${normalized_base}`
  )
  return normalized_base
}

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
 * Enumerate all file paths under user_base_directory using ripgrep.
 * Returns a high cap of results; downstream callers score and truncate.
 *
 * @param {Object} [params]
 * @param {string} [params.directory] - Optional subdirectory to scope
 * @param {number} [params.max_results=20000] - Max paths to return
 * @returns {Promise<Array<{file_path: string, absolute_path: string, type: 'file'}>>}
 */
export async function list_file_paths({
  directory = null,
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
    log(`list_file_paths failed: ${error.message}`)
    return []
  }
}

export default { list_file_paths }
