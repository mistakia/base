import fs from 'fs'
import path from 'path'
import { resolve_base_uri } from '#libs-server/base-uri/index.mjs'
import { write_tag_to_filesystem } from '#libs-server/tag/filesystem/write-tag-to-filesystem.mjs'

/**
 * Creates a tag entity for testing in the filesystem.
 *
 * @param {Object} options - Test options
 * @param {string} options.user_public_key - User public key
 * @param {string} [options.title='Test Tag'] - Tag title
 * @param {string} [options.description='A tag for testing'] - Tag description
 * @param {string} [options.color='#FF0000'] - Tag color
 * @param {string} [options.base_uri] - Tag base_uri in format sys:tag/<tag-title>.md or user:tag/<tag-title>.md
 * @returns {Promise<Object>} Object containing base_uri and cleanup function
 */
export default async function create_test_tag({
  user_public_key,
  title = 'Test Tag',
  description = 'A tag for testing',
  color = '#FF0000',
  base_uri
}) {
  if (!user_public_key) {
    throw new Error('user_public_key is required')
  }

  const tag_properties = {
    title,
    user_public_key,
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
    base_uri,
    cleanup
  }
}
