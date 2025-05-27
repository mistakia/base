import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures_path = path.resolve(__dirname, '..', 'fixtures')

/**
 * Get the filesystem path to a fixture file
 *
 * @param {string} fixture_path - Relative path to fixture from fixtures directory
 * @returns {string} Absolute path to fixture file
 */
export function get_fixture_path(fixture_path) {
  return path.join(fixtures_path, fixture_path)
}
