import db from '#db'

/**
 * Get all tags for a user with optional filtering
 *
 * @param {Object} params - Parameters for retrieving tags
 * @param {string} params.user_id - The user ID whose tags to retrieve
 * @param {boolean} params.archived - Whether to include archived tags (default: false)
 * @param {string} params.search_term - Optional search term to filter tags by title
 * @returns {Promise<Array>} - Array of tag objects
 */
export default async function get_tags({
  user_id,
  archived = false,
  search_term = null
}) {
  // Start with a query joining entities and tags
  const query = db('entities as e')
    .join('tags as t', 'e.entity_id', 't.entity_id')
    .where({
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
    .orderBy('e.title', 'asc')

  // Filter by archived status
  if (archived) {
    query.whereNotNull('e.archived_at')
  } else {
    query.whereNull('e.archived_at')
  }

  // Filter by search term if provided
  if (search_term) {
    query.where('e.title', 'ilike', `%${search_term}%`)
  }

  // Execute the query and return results
  return query
}
