import debug from 'debug'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import * as prettier from 'prettier'

const log = debug('formatting:format-markdown-file-with-prettier')

// Config cache with TTL to avoid N+1 resolution in batch operations
const config_cache = new Map()
const CACHE_TTL_MS = 60000 // 1 minute
const OPERATION_TIMEOUT_MS = 5000 // 5 seconds

/**
 * @param {Object} options
 * @param {string} options.absolute_path
 * @returns {Promise<boolean>}
 */
export async function format_markdown_file_with_prettier({ absolute_path }) {
  try {
    // Early return if not a markdown file
    const file_extension = path.extname(absolute_path).toLowerCase()
    if (file_extension !== '.md') {
      log(`Skipping non-markdown file: ${absolute_path}`)
      return false
    }

    log(`Formatting markdown file: ${absolute_path}`)

    // Read the file content
    const file_content = await readFile(absolute_path, 'utf8')

    // Resolve prettier config with caching and timeout
    const prettier_config = await get_prettier_config_cached(absolute_path)

    // Format the content with timeout protection
    const formatted_content = await with_timeout(
      prettier.format(file_content, {
        ...prettier_config,
        parser: 'markdown',
        filepath: absolute_path
      }),
      OPERATION_TIMEOUT_MS,
      'Prettier format timeout'
    )

    // Only write if content changed
    if (formatted_content !== file_content) {
      await writeFile(absolute_path, formatted_content, 'utf8')
      log(`Successfully formatted: ${absolute_path}`)
    } else {
      log(`No formatting changes needed: ${absolute_path}`)
    }

    return true
  } catch (error) {
    // Log error but never throw - formatting failure should not break entity creation
    log(`Error formatting file ${absolute_path}:`, error.message)
    return false
  }
}

/**
 * Get prettier config with directory-based caching
 */
async function get_prettier_config_cached(file_path) {
  const dir = path.dirname(file_path)
  const cached = config_cache.get(dir)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config
  }

  const config = await with_timeout(
    prettier.resolveConfig(file_path),
    OPERATION_TIMEOUT_MS,
    'Prettier config resolution timeout'
  )

  config_cache.set(dir, { config, timestamp: Date.now() })
  return config
}

/**
 * Wrap a promise with timeout protection
 */
function with_timeout(promise, timeout_ms, timeout_message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeout_message)), timeout_ms)
    )
  ])
}
