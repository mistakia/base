import fs from 'fs'
import path from 'path'
import { write_tag_to_database } from '#libs-server/entity/database/write/write-tag-to-database.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import { write_tag_to_filesystem } from '#libs-server/tag/filesystem/write-tag-to-filesystem.mjs'
import { create_temp_test_directory } from './create-temp-test-directory.mjs'
import db from '#db'

/**
 * Creates a tag entity for testing. This function creates both:
 *
 * 1. Database tag: Stored in the entities table with type='tag' and have a UUID entity_id.
 *    These tags are referenced in the entity_tags table via the tag_entity_id column (UUID).
 *
 * 2. Filesystem tag: Stored as markdown files in the filesystem with a path based on base_relative_path.
 *    The base_relative_path is a string in the format "system/tag-name" or "user/tag-name".
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Tag'] - Tag title
 * @param {string} [options.description='A tag for testing'] - Tag description
 * @param {string} [options.color='#FF0000'] - Tag color
 * @param {string} [options.base_relative_path] - Tag base_relative_path in format [system|user]/<tag-title>
 * @param {string} [options.root_base_directory] - Custom root base directory for tests
 * @returns {Promise<Object>} Object containing tag_entity_id, base_relative_path, root_base_directory, and cleanup function
 */
export default async function create_test_tag({
  user_id,
  title = 'Test Tag',
  description = 'A tag for testing',
  color = '#FF0000',
  base_relative_path,
  root_base_directory
}) {
  if (!user_id) {
    throw new Error('user_id is required')
  }

  const tag_properties = {
    title,
    user_id,
    description,
    color,
    created_at: new Date(),
    updated_at: new Date()
  }

  // Generate base_relative_path if not provided
  if (!base_relative_path) {
    base_relative_path = `user/${title.replace(/\s+/g, '-')}`
  }

  // Create temp directory if not provided
  let cleanup_temp_dir
  if (!root_base_directory) {
    const temp_test_dir = create_temp_test_directory('tag-test-')
    root_base_directory = temp_test_dir.path
    cleanup_temp_dir = temp_test_dir.cleanup
  }

  // Get file info using the base_relative_path
  const { absolute_path } = await get_base_file_info({
    base_relative_path,
    root_base_directory
  })

  // Make sure the directory exists
  const dir_path = path.dirname(absolute_path)
  fs.mkdirSync(dir_path, { recursive: true })

  // Write tag to filesystem
  await write_tag_to_filesystem({
    base_relative_path,
    tag_properties,
    root_base_directory
  })

  // Write tag to database
  const tag_entity_id = await write_tag_to_database({
    tag_properties,
    user_id,
    file_info: {
      base_relative_path
    }
  })

  // Get the base_relative_path from the database to ensure consistency
  const tag_data = await db('entities')
    .select('base_relative_path')
    .where('entity_id', tag_entity_id)
    .first()

  const cleanup = () => {
    try {
      if (fs.existsSync(absolute_path)) {
        fs.unlinkSync(absolute_path)
      }
      // Also clean up temp directory if we created one
      if (cleanup_temp_dir) {
        cleanup_temp_dir()
      }
    } catch (error) {
      console.error(`Error cleaning up tag file ${absolute_path}:`, error)
    }
  }

  return {
    tag_entity_id,
    base_relative_path: tag_data.base_relative_path,
    root_base_directory,
    cleanup
  }
}
