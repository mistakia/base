import db from '#db'

/**
 * List tags from the database
 *
 * @param {Object} params Parameters
 * @param {string} params.user_id User ID
 * @param {boolean} [params.archived=false] Whether to include archived tags
 * @param {string} [params.search_term] Search term to filter tags by title
 * @returns {Promise<Array>} Array of tag objects
 */
export async function list_tags_from_database({
  user_id,
  archived = false,
  search_term
} = {}) {
  if (!user_id) {
    throw new Error('user_id is required')
  }

  let query = db('tag')
    .select('*')
    .where({ user_id, archived })
    .orderBy('title', 'asc')

  if (search_term) {
    query = query.whereILike('title', `%${search_term}%`)
  }

  return await query
}
