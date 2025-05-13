import { read_file_from_git } from '../../git/git-files/read-file-from-git.mjs'
import { tag_exists_in_git } from './tag-exists-in-git.mjs'
import { resolve_tag_path } from '../constants.mjs'

/**
 * Read a tag from git
 *
 * @param {Object} params Parameters
 * @param {string} params.tag_id Tag ID to read in format [system|user]/<tag-title>
 * @param {string} [params.ref] Git reference (branch, commit, tag)
 * @param {string} [params.repository_path] Path to the repository
 * @param {string} [params.system_base_directory] Custom system base directory
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Tag data
 * @throws {Error} If tag doesn't exist or reading fails
 */
export async function read_tag_from_git({
  tag_id,
  ref,
  repository_path,
  system_base_directory,
  user_base_directory
} = {}) {
  if (!tag_id) {
    throw new Error('tag_id is required')
  }

  // Check if tag exists in git before trying to read
  const tag_exists = await tag_exists_in_git({
    tag_id,
    ref,
    repository_path,
    system_base_directory,
    user_base_directory
  })

  if (!tag_exists) {
    throw new Error(
      `Tag ${tag_id} does not exist in git at ref ${ref || 'HEAD'}`
    )
  }

  // Resolve the tag path
  const { base_relative_path, tag_title, type } = resolve_tag_path({
    tag_id,
    system_base_directory,
    user_base_directory
  })

  try {
    // Read the file from git
    const tag_content = await read_file_from_git({
      file_path: base_relative_path,
      ref,
      repository_path
    })

    // Parse the JSON content
    const tag_data = JSON.parse(tag_content)

    // Add the type and tag_id properties if they're not already present
    return {
      ...tag_data,
      type: tag_data.type || type,
      tag_id: tag_data.tag_id || tag_id,
      title: tag_data.title || tag_title
    }
  } catch (error) {
    throw new Error(`Failed to read tag ${tag_id} from git: ${error.message}`)
  }
}
