import db from '#db'

/**
 * List tags from the database
 *
 * @param {Object} params Parameters
 * @param {string} params.user_id User ID
 * @param {boolean} [params.include_archived=false] Whether to include archived tags
 * @param {string} [params.search_term] Search term to filter tags by title
 * @returns {Promise<Array>} Array of tag objects
 */
export async function list_tags_from_database({
  user_id,
  include_archived = false,
  search_term
} = {}) {
  if (!user_id) {
    throw new Error('user_id is required')
  }

  // Start with a query joining entities and tags
  const query = db('entities as e')
    .join('tags as t', 'e.entity_id', 't.entity_id')
    .where({
      'e.user_id': user_id,
      'e.type': 'tag'
    })
    .select(
      'e.entity_id as tag_entity_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.created_at',
      'e.updated_at',
      't.color'
    )
    .orderBy('e.title', 'asc')

  // Filter by archived status
  if (include_archived) {
    query.whereNotNull('e.archived_at')
  } else {
    query.whereNull('e.archived_at')
  }

  // Filter by search term if provided
  if (search_term) {
    query.where('e.title', 'ilike', `%${search_term}%`)
  }

  return await query
}
