import fs from 'fs'
import path from 'path'
import { write_tag_to_database } from '#libs-server/entity/database/write/write-tag-to-database.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/index.mjs'
import { write_tag_to_filesystem } from '#libs-server/tag/filesystem/write-tag-to-filesystem.mjs'
import db from '#db'

/**
 * Creates a tag entity for testing. This function creates both:
 *
 * 1. Database tag: Stored in the entities table with type='tag' and have a UUID entity_id.
 *    These tags are referenced in the entity_tags table via the tag_entity_id column (UUID).
 *
 * 2. Filesystem tag: Stored as markdown files in the filesystem with a path based on base_uri.
 *    The base_uri is a string in the format "sys:tag/tag-name.md" or "user:tag/tag-name.md".
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Tag'] - Tag title
 * @param {string} [options.description='A tag for testing'] - Tag description
 * @param {string} [options.color='#FF0000'] - Tag color
 * @param {string} [options.base_uri] - Tag base_uri in format sys:tag/<tag-title>.md or user:tag/<tag-title>.md
 * @returns {Promise<Object>} Object containing tag_entity_id, base_uri, and cleanup function
 */
export default async function create_test_tag({
  user_id,
  title = 'Test Tag',
  description = 'A tag for testing',
  color = '#FF0000',
  base_uri
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

  // Generate base_uri if not provided - default to user tag with proper URI format
  if (!base_uri) {
    const tag_filename = `${title.replace(/\s+/g, '-').toLowerCase()}.md`
    base_uri = `user:tag/${tag_filename}`
  }

  // Resolve absolute path using registry
  const absolute_path = resolve_base_uri(base_uri)

  // Make sure the directory exists
  const dir_path = path.dirname(absolute_path)
  fs.mkdirSync(dir_path, { recursive: true })

  // Write tag to filesystem
  await write_tag_to_filesystem({
    base_uri,
    tag_properties
  })

  // Write tag to database
  const tag_entity_id = await write_tag_to_database({
    tag_properties,
    user_id,
    absolute_path: absolute_path || '/dummy/path.md',
    base_uri,
    git_sha: 'dummysha1'
  })

  // Get the base_uri from the database to ensure consistency
  const tag_data = await db('entities')
    .select('base_uri')
    .where('entity_id', tag_entity_id)
    .first()

  const cleanup = () => {
    try {
      if (fs.existsSync(absolute_path)) {
        fs.unlinkSync(absolute_path)
      }
    } catch (error) {
      console.error(`Error cleaning up tag file ${absolute_path}:`, error)
    }
  }

  return {
    tag_entity_id,
    base_uri: tag_data.base_uri,
    cleanup
  }
}
