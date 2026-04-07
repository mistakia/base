import express from 'express'
import {
  list_tags_from_filesystem,
  read_tag_from_filesystem
} from '#libs-server/tag/index.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { normalize_sqlite_thread } from '#server/lib/threads/process-thread-table-request.mjs'
import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { check_permission } from '#server/middleware/permission/index.mjs'
import { redact_entity_object } from '#server/middleware/content-redactor.mjs'
import {
  filter_entities_by_permission,
  filter_threads_by_permission
} from '#server/middleware/permission/redact-entity-references.mjs'

const router = express.Router({ mergeParams: true })

/**
 * Query threads directly tagged with a given tag via the thread_tags table.
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
  try {
    const sort_column = sort === 'created_at' ? 'created_at' : 'updated_at'
    const sqlite_threads = await embedded_index_manager.query_threads({
      tags: [tag_base_uri],
      sort: [{ column_id: sort_column, desc: true }],
      limit
    })

    let models_data = null
    try {
      const cache_data = await get_models_from_cache()
      models_data = cache_data?.models || null
    } catch {
      // Cost calculation will work without models data
    }

    return sqlite_threads.map((thread) =>
      normalize_sqlite_thread(thread, models_data)
    )
  } catch {
    // SQLite not initialized or tables don't exist yet
    return []
  }
}

/**
 * Count threads directly tagged with a given tag via the thread_tags table.
 */
async function count_threads_by_tag({ tag_base_uri }) {
  try {
    return await embedded_index_manager.count_threads({
      tags: [tag_base_uri]
    })
  } catch {
    return 0
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
      limit = '50',
      used_by
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

      // Get all entities associated with this tag using SQLite index
      // For redacted tags, return empty entities list
      let tagged_entities = []
      let task_count = 0
      let completed_task_count = 0
      let total_entity_count = 0

      if (!is_redacted) {
        try {
          tagged_entities = await embedded_index_manager.query_entities({
            filters: [
              { column_id: 'tags', operator: 'IN', value: [tag.base_uri] }
            ],
            sort: [{ column_id: 'updated_at', desc: true }],
            limit: parsed_limit
          })
        } catch (err) {
          // SQLite may not be available, return empty array
          log('Failed to query entities from SQLite: %s', err.message)
          tagged_entities = []
        }

        // Apply per-entity permission redaction
        tagged_entities = await filter_entities_by_permission({
          entities: tagged_entities,
          user_public_key
        })

        // Get accurate counts using count queries (independent of entity limit)
        try {
          const tag_filter = {
            column_id: 'tags',
            operator: 'IN',
            value: [tag.base_uri]
          }

          const [non_completed_count, completed_count, entity_count] =
            await Promise.all([
              embedded_index_manager.count_entities({
                filters: [
                  tag_filter,
                  { column_id: 'type', operator: '=', value: 'task' },
                  {
                    column_id: 'status',
                    operator: 'NOT IN',
                    value: ['Completed', 'Abandoned']
                  }
                ]
              }),
              embedded_index_manager.count_entities({
                filters: [
                  tag_filter,
                  { column_id: 'type', operator: '=', value: 'task' },
                  {
                    column_id: 'status',
                    operator: 'IN',
                    value: ['Completed', 'Abandoned']
                  }
                ]
              }),
              embedded_index_manager.count_entities({
                filters: [tag_filter]
              })
            ])

          task_count = non_completed_count
          completed_task_count = completed_count
          total_entity_count = entity_count
        } catch (err) {
          log('Failed to get entity counts: %s', err.message)
          // Fallback to counting from fetched entities
          const closed_statuses = ['Completed', 'Abandoned']
          task_count = tagged_entities.filter(
            (e) => e.type === 'task' && !closed_statuses.includes(e.status)
          ).length
          completed_task_count = tagged_entities.filter(
            (e) => e.type === 'task' && closed_statuses.includes(e.status)
          ).length
          total_entity_count = tagged_entities.length
        }
      }

      // Get threads directly tagged with this tag
      // For redacted tags, return empty threads list
      let threads = []
      let thread_count = 0

      if (include_threads === 'true' && !is_redacted) {
        const [thread_results, thread_total] = await Promise.all([
          query_threads_by_tag({
            tag_base_uri: tag.base_uri,
            sort,
            limit: parsed_limit
          }),
          count_threads_by_tag({
            tag_base_uri: tag.base_uri
          })
        ])

        // Apply per-thread permission redaction
        threads = await filter_threads_by_permission({
          threads: thread_results,
          user_public_key
        })
        thread_count = thread_total
      }

      // Return tag with entities, threads, and counts
      res.send({
        tag: response_tag,
        entities: tagged_entities,
        threads,
        task_count,
        completed_task_count,
        thread_count,
        total_entity_count,
        is_redacted
      })
    } else {
      // If no base_uri, list all tags (requires authentication)
      // The underlying list function filters by user_public_key
      if (!user_public_key) {
        return res.status(401).send({ error: 'authentication required' })
      }

      let tags = await list_tags_from_filesystem({
        user_public_key,
        include_archived: include_archived === 'true',
        search_term
      })

      // Filter to only tags used by a specific entity type or threads
      if (used_by) {
        try {
          const used_tag_uris = await embedded_index_manager.query_tags({
            used_by
          })
          tags = tags.filter((tag) => used_tag_uris.has(tag.base_uri))
        } catch (err) {
          log('Failed to filter tags by used_by=%s: %s', used_by, err.message)
        }
      }

      res.send(tags)
    }
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
