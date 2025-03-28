import db from '#db'

/**
 * Get a tag by entity ID
 *
 * @param {Object} params - Parameters for retrieving a tag
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns this tag
 * @returns {Promise<Object|null>} - The tag object or null if not found
 */
export async function get_tag_by_id({ tag_id, user_id }) {
  const tag = await db('entities as e')
    .join('tags as t', 'e.entity_id', 't.entity_id')
    .where({
      'e.entity_id': tag_id,
      'e.user_id': user_id,
      'e.type': 'tag'
    })
    .select(
      'e.entity_id as tag_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      't.color'
    )
    .first()

  if (!tag) {
    return null
  }

  return tag
}

/**
 * Get a tag by name
 *
 * @param {Object} params - Parameters for retrieving a tag
 * @param {string} params.title - The tag name (title)
 * @param {string} params.user_id - The user ID who owns this tag
 * @returns {Promise<Object|null>} - The tag object or null if not found
 */
export async function get_tag_by_name({ title, user_id }) {
  const tag = await db('entities as e')
    .join('tags as t', 'e.entity_id', 't.entity_id')
    .where({
      'e.title': title,
      'e.user_id': user_id,
      'e.type': 'tag'
    })
    .select(
      'e.entity_id as tag_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      't.color'
    )
    .first()

  if (!tag) {
    return null
  }

  return tag
}

/**
 * Default export for getting a tag by ID
 */
export default get_tag_by_id
