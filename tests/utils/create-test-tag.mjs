import { write_tag_to_database } from '#libs-server/entity/database/write/write-tag-to-database.mjs'

/**
 * Creates a tag entity for testing
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Tag'] - Tag title
 * @param {string} [options.description='A tag for testing'] - Tag description
 * @param {string} [options.color='#FF0000'] - Tag color
 * @returns {Promise<string>} Tag entity ID
 */
export default async function create_test_tag({
  user_id,
  title = 'Test Tag',
  description = 'A tag for testing',
  color = '#FF0000'
}) {
  const tag_properties = {
    title,
    description,
    color
  }

  return write_tag_to_database({
    tag_properties,
    user_id
  })
}
