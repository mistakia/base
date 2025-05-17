import debug from 'debug'
// import { list_markdown_files_in_filesystem } from './list-markdown-files-in-filesystem.mjs'

const log = debug('markdown:schema:filesystem')

/**
 * Load all schema definitions from filesystem
 * @param {Object} options Options
 * @param {Object} [options.system_repository] System repository configuration
 * @param {Object} [options.user_repository] User repository configuration
 * @returns {Promise<Object>} Schema definitions
 */
export async function load_schema_definitions_from_filesystem({
  system_repository,
  user_repository
} = {}) {
  // TODO: Implement schema loading from filesystem
  log('Loading schema definitions from filesystem')

  // This is a placeholder implementation
  return {}
}
