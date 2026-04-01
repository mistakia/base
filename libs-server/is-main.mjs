import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'

/**
 * Check if the current module is the main entry point.
 * @param {string} import_meta_url - Pass import.meta.url from the calling module
 * @returns {boolean}
 */
export const isMain = (import_meta_url) => {
  const target = fileURLToPath(import_meta_url)
  if (process.argv[1] === target) return true
  try {
    return realpathSync(process.argv[1]) === target
  } catch {
    return false
  }
}
