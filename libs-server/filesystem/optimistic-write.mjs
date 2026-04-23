import { promises as fs } from 'fs'
import debug from 'debug'

import { write_file_to_filesystem } from './write-file-to-filesystem.mjs'

const log = debug('base:filesystem:optimistic-write')

/**
 * @internal
 * Test-only path-keyed registry of pre-write hooks. Consumed by
 * `read_modify_write` after each `modify` call and before the post-stat
 * re-check. Provides a race-injection point for tests that cannot
 * monkey-patch ESM imports (project runs mocha with no mocking library).
 * Production callers never set entries; the map is empty at runtime.
 */
const _test_pre_write_hooks = new Map()

export function _set_test_pre_write_hook(absolute_path, hook) {
  if (hook) {
    _test_pre_write_hooks.set(absolute_path, hook)
  } else {
    _test_pre_write_hooks.delete(absolute_path)
  }
}

export function _clear_test_pre_write_hooks() {
  _test_pre_write_hooks.clear()
}

/**
 * Performs a read-modify-write with optimistic concurrency control.
 * Reads file content and mtime, passes content to the modify callback,
 * then re-checks mtime before writing. Retries on conflict.
 *
 * @param {Object} params
 * @param {string} params.absolute_path - Absolute path to the file
 * @param {Function} params.modify - Async callback: (content: string) => string
 * @param {number} [params.max_retries=3] - Maximum retry attempts on mtime conflict
 * @param {Function} [params.on_pre_write] - @internal Test-only async hook invoked after `modify` returns and before the post-stat re-check. Do not use in production callers.
 * @returns {Promise<string>} The written content
 */
export async function read_modify_write({
  absolute_path,
  modify,
  max_retries = 3,
  on_pre_write
}) {
  for (let attempt = 0; attempt <= max_retries; attempt++) {
    const pre_stat = await fs.stat(absolute_path)
    const content = await fs.readFile(absolute_path, 'utf8')

    const new_content = await modify(content)

    if (on_pre_write) {
      await on_pre_write()
    }

    const test_hook = _test_pre_write_hooks.get(absolute_path)
    if (test_hook) {
      await test_hook({ absolute_path, attempt })
    }

    // Re-check mtime before writing
    const post_stat = await fs.stat(absolute_path)
    if (pre_stat.mtimeMs !== post_stat.mtimeMs) {
      log(
        'mtime conflict on %s (attempt %d/%d)',
        absolute_path,
        attempt + 1,
        max_retries
      )
      if (attempt < max_retries) {
        continue
      }
      const error = new Error(
        `read_modify_write: max retries (${max_retries}) exhausted for ${absolute_path} — file was modified concurrently`
      )
      error.code = 'EMTIME_CONFLICT'
      error.absolute_path = absolute_path
      error.attempts = attempt + 1
      throw error
    }

    await write_file_to_filesystem({
      absolute_path,
      file_content: new_content
    })

    return new_content
  }
}
