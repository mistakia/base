import db from '#db'
import { read_entity_from_database } from '#libs-server/entity/database/read/read-entity-from-database.mjs'

/**
 * Search for entities with optional tag filtering
 *
 * @param {Object} params - Parameters for searching entities
 * @param {string} params.user_id - The user ID who owns the entities
 * @param {string[]} [params.tag_base_uris] - Optional array of tag base_uris to filter by
 * @param {boolean} [params.include_archived=false] - Whether to include archived entities
 * @param {string[]} [params.entity_types] - Optional array of entity types to filter by
 * @param {string} [params.search_term] - Optional search term to filter by title
 * @param {number} [params.limit=100] - Maximum number of entities to return
 * @param {number} [params.offset=0] - Offset for pagination
 * @param {Object} [params.trx] - Optional Knex transaction object
 * @returns {Promise<Array>} - Array of matching entities
 */
export default async function search_entities({
  user_id,
  tag_base_uris = null,
  include_archived = false,
  entity_types = null,
  search_term = null,
  limit = 100,
  offset = 0,
  trx
}) {
  // Validate required parameters
  if (!user_id) {
    throw new Error('user_id is required for entity search')
  }

  // Use transaction if provided, otherwise use main db connection
  const db_client = trx || db

  // Start building the query
  const query = db_client('entities as e')
    .where('e.user_id', user_id)
    .select('e.entity_id', 'e.type', 'e.title', 'e.created_at', 'e.updated_at')
    .orderBy('e.updated_at', 'desc')
    .limit(limit)
    .offset(offset)

  // Filter by archived status
  if (include_archived) {
    query.whereNotNull('e.archived_at')
  } else {
    query.whereNull('e.archived_at')
  }

  // Filter by entity types if specified
  if (entity_types && entity_types.length > 0) {
    query.whereIn('e.type', entity_types)
  }

  // Filter by search term if specified
  if (search_term && search_term.trim()) {
    const term = `%${search_term.trim()}%`
    query.where('e.title', 'like', term)
  }

  // Filter by tags if specified using base_uris
  if (tag_base_uris && tag_base_uris.length > 0) {
    // First get the tag entity IDs from the base_uris
    const tag_entities = await db_client('entities')
      .select('entity_id')
      .whereIn('base_uri', tag_base_uris)
      .where('user_id', user_id)
      .where('type', 'tag')

    // Extract the entity_ids into an array
    const tag_entity_ids = tag_entities.map((tag) => tag.entity_id)

    // Only continue with filtering if we found matching tags
    if (tag_entity_ids.length > 0) {
      // Use a distinct subquery to find entities that have all the specified tags
      const entity_ids_with_all_tags = db_client('entities as e')
        .join('entity_tags as et', 'e.entity_id', 'et.entity_id')
        .where('e.user_id', user_id)
        .whereIn('et.tag_entity_id', tag_entity_ids)
        .groupBy('e.entity_id')
        .havingRaw('COUNT(DISTINCT et.tag_entity_id) = ?', [
          tag_entity_ids.length
        ])
        .select('e.entity_id')

      query.whereIn('e.entity_id', entity_ids_with_all_tags)
    } else {
      // If no tags match the provided base_uris, return empty result
      return []
    }
  }

  // Execute the query
  const entities = await query

  // Fetch complete entity data for each result
  const result = await Promise.all(
    entities.map((entity) =>
      read_entity_from_database({
        entity_id: entity.entity_id,
        user_id,
        include_tags: true,
        trx
      })
    )
  )

  // Filter out any null results
  return result.filter((e) => e !== null)
}
