import express from 'express'
import {
  list_tags_from_filesystem,
  read_tag_from_filesystem
} from '#libs-server/tag/index.mjs'
import { query_entities_from_duckdb } from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { get_duckdb_connection } from '#libs-server/embedded-database-index/duckdb/duckdb-database-client.mjs'
import { normalize_duckdb_thread } from '#libs-server/threads/process-thread-table-request.mjs'
import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { check_permission } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import {
  filter_entities_by_permission,
  filter_threads_by_permission
} from '#server/middleware/permission/redact-entity-references.mjs'

const router = express.Router({ mergeParams: true })

/**
 * Query threads by tag base_uri from DuckDB thread_tags table
 *
 * @param {Object} params - Query parameters
 * @param {string} params.tag_base_uri - Tag base_uri to filter by
 * @param {string} [params.sort='updated_at'] - Sort field
 * @param {number} [params.limit=50] - Maximum number of results
 * @returns {Promise<Array>} Array of normalized thread objects
 */
async function query_threads_by_tag({
  tag_base_uri,
  sort = 'updated_at',
  limit = 50
}) {
  let duckdb_connection
  try {
    duckdb_connection = await get_duckdb_connection()
  } catch {
    // DuckDB not initialized - return empty array
    return []
  }

  // If DuckDB isn't available or thread_tags table doesn't exist yet,
  // return empty array (thread tagging is a separate implementation task)
  if (!duckdb_connection) {
    return []
  }

  try {
    // Query threads that have this tag via thread_tags join table
    // This will return results once the automatic thread tag evaluation task populates thread_tags
    const sort_direction = 'DESC'
    const query = `
      SELECT t.*
      FROM threads t
      INNER JOIN thread_tags tt ON t.thread_id = tt.thread_id
      WHERE tt.tag_base_uri = ?
      ORDER BY t.${sort === 'created_at' ? 'created_at' : 'updated_at'} ${sort_direction}
      LIMIT ?
    `

    const results = await new Promise((resolve, reject) => {
      duckdb_connection.all(query, tag_base_uri, limit, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    // Fetch models data for cost calculation
    let models_data = null
    try {
      const cache_data = await get_models_from_cache()
      models_data = cache_data?.models || null
    } catch {
      // Cost calculation will work without models data
    }

    // Normalize thread data to match expected format
    return results.map((thread) => normalize_duckdb_thread(thread, models_data))
  } catch (error) {
    // thread_tags table may not exist yet - this is expected until
    // the automatic thread tag evaluation task is implemented
    if (error.message?.includes('thread_tags')) {
      return []
    }
    throw error
  }
}

// Get a list of all tags for the authenticated user OR get a specific tag by base_uri
router.get('/', async (req, res) => {
  const { log } = req.app.locals
  try {
    const {
      base_uri,
      include_archived,
      search_term,
      include_threads = 'true',
      sort = 'updated_at',
      limit = '50'
    } = req.query
    const user_public_key = req.user?.user_public_key || null

    // If base_uri is provided, get a specific tag with entities and threads
    // This path allows public access with permission checking
    if (base_uri) {
      // Read the tag directly from filesystem using registry-based resolution
      const tag_result = await read_tag_from_filesystem({
        base_uri
      })

      if (!tag_result.success) {
        return res.status(404).send({
          error: `Tag ${base_uri} not found: ${tag_result.error}`
        })
      }

      // Preserve the entity_properties structure in response
      const tag = {
        entity_properties: tag_result.entity_properties,
        base_uri: tag_result.base_uri
      }

      // Check permission for this tag
      const permission_result = await check_permission({
        user_public_key,
        resource_path: base_uri
      })

      // If user doesn't have read permission, return redacted tag
      let response_tag = tag
      let is_redacted = false
      if (!permission_result.read.allowed) {
        const redacted = redact_entity_object({
          entity_properties: tag.entity_properties
        })
        response_tag = {
          entity_properties: redacted.entity_properties,
          base_uri: tag.base_uri
        }
        is_redacted = true
      }

      const parsed_limit = parseInt(limit, 10) || 50

      // Get all entities associated with this tag using DuckDB index
      // For redacted tags, return empty entities list
      let tagged_entities = []
      if (!is_redacted) {
        try {
          tagged_entities = await query_entities_from_duckdb({
            filters: [
              { column_id: 'tags', operator: 'IN', value: [tag.base_uri] }
            ],
            sort: [{ column_id: 'updated_at', desc: true }],
            limit: parsed_limit
          })
        } catch (err) {
          // DuckDB may not be available, return empty array
          log('Failed to query entities from DuckDB: %s', err.message)
          tagged_entities = []
        }

        // Apply per-entity permission redaction
        tagged_entities = await filter_entities_by_permission({
          entities: tagged_entities,
          user_public_key
        })
      }

      // Count tasks (entities with type === 'task')
      const task_count = tagged_entities.filter(
        (entity) => entity.type === 'task'
      ).length

      // Get threads tagged with this tag (if include_threads is true)
      // For redacted tags, return empty threads list
      let threads = []
      let thread_count = 0

      if (include_threads === 'true' && !is_redacted) {
        threads = await query_threads_by_tag({
          tag_base_uri: tag.base_uri,
          sort,
          limit: parsed_limit
        })

        // Apply per-thread permission redaction
        threads = await filter_threads_by_permission({
          threads,
          user_public_key
        })
        thread_count = threads.length
      }

      // Return tag with entities, threads, and counts
      res.send({
        tag: response_tag,
        entities: tagged_entities,
        threads,
        task_count,
        thread_count,
        total_entity_count: tagged_entities.length,
        is_redacted
      })
    } else {
      // If no base_uri, list all tags (requires authentication)
      // The underlying list function filters by user_public_key
      if (!user_public_key) {
        return res.status(401).send({ error: 'authentication required' })
      }

      const tags = await list_tags_from_filesystem({
        user_public_key,
        include_archived: include_archived === 'true',
        search_term
      })

      res.send(tags)
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
