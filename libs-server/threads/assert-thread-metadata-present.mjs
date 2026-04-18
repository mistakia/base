import fs from 'fs/promises'
import path from 'path'

/**
 * Enforce the metadata.json lifecycle-anchor invariant for a thread directory.
 *
 * thread/<id>/metadata.json must exist before any sibling file (raw-data/,
 * timeline.jsonl, ...) is written. Callers on the update path invoke this
 * after the metadata writer has run so that a missing file is a loud error
 * rather than a silent divergence on disk.
 *
 * @param {Object} params
 * @param {string} params.thread_dir Absolute path to thread/<id>/
 * @returns {Promise<void>} Resolves if metadata.json is present; throws otherwise
 */
export const assert_thread_metadata_present = async ({ thread_dir }) => {
  const metadata_path = path.join(thread_dir, 'metadata.json')
  try {
    await fs.access(metadata_path)
  } catch (error) {
    if (error.code === 'ENOENT') {
      const violation = new Error(
        `thread metadata invariant violated: ${metadata_path} is missing. ` +
          `metadata.json must be written before any other file in the thread directory.`
      )
      violation.code = 'THREAD_METADATA_MISSING'
      violation.thread_dir = thread_dir
      throw violation
    }
    throw error
  }
}
