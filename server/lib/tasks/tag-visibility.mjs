/**
 * @fileoverview Tag visibility computation and redaction utilities
 *
 * Provides centralized functions for:
 * - Computing tag visibility based on user permissions
 * - Redacting non-visible tag URIs in responses
 * - Applying tag redaction to task arrays
 */

import debug from 'debug'

import { check_permissions_batch } from '#server/middleware/permission/index.mjs'
import { redact_base_uri } from '#server/middleware/content-redactor.mjs'

const log = debug('tasks:tag-visibility')

/**
 * Collect unique tag URIs from an array of tasks
 *
 * @param {Object[]} tasks - Array of task objects
 * @returns {Set<string>} Set of unique tag URIs
 */
const collect_unique_tag_uris = (tasks) => {
  const tag_uris = new Set()

  for (const task of tasks) {
    // Handle both nested (entity_properties.tags) and flat (tags) structures
    const tags = task.entity_properties?.tags || task.tags || []
    for (const tag_uri of tags) {
      if (tag_uri) {
        tag_uris.add(tag_uri)
      }
    }
  }

  return tag_uris
}

/**
 * Compute tag visibility map with redacted URIs for non-visible tags
 *
 * Returns a map where:
 * - Visible tags: original URI as key, true as value
 * - Non-visible tags: redacted URI as key, false as value
 *
 * Also returns a lookup map from original URI to the key used in visibility map
 *
 * @param {Object} params
 * @param {string[]} params.tag_uris - Array of tag URIs to check
 * @param {string|null} params.user_public_key - User's public key (null for public access)
 * @returns {Promise<{visibility_map: Object, uri_to_key_map: Object}>}
 */
export const compute_tag_visibility = async ({ tag_uris, user_public_key }) => {
  if (!tag_uris || tag_uris.length === 0) {
    return { visibility_map: {}, uri_to_key_map: {} }
  }

  const unique_uris = [...new Set(tag_uris)]

  log(
    `Computing visibility for ${unique_uris.length} tags, user: ${user_public_key || 'public'}`
  )

  // Batch check permissions for all tags
  const permission_results = await check_permissions_batch({
    user_public_key,
    resource_paths: unique_uris
  })

  const visibility_map = {}
  const uri_to_key_map = {}

  for (const tag_uri of unique_uris) {
    const permission = permission_results[tag_uri]
    const is_visible = permission?.read?.allowed === true

    if (is_visible) {
      // Visible tag: use original URI as key
      visibility_map[tag_uri] = true
      uri_to_key_map[tag_uri] = tag_uri
    } else {
      // Non-visible tag: use redacted URI as key
      const redacted_uri = redact_base_uri(tag_uri)
      visibility_map[redacted_uri] = false
      uri_to_key_map[tag_uri] = redacted_uri
    }
  }

  return { visibility_map, uri_to_key_map }
}

/**
 * Redact non-visible tags in a tags array
 *
 * @param {Object} params
 * @param {string[]} params.tags - Array of tag URIs
 * @param {Object} params.uri_to_key_map - Map from original URI to visibility key
 * @returns {string[]} Array with non-visible tags replaced by redacted URIs
 */
export const redact_tags_array = ({ tags, uri_to_key_map }) => {
  if (!tags || !Array.isArray(tags)) {
    return tags
  }

  return tags.map((tag_uri) => {
    // Use the mapped key (original for visible, redacted for non-visible)
    return uri_to_key_map[tag_uri] || redact_base_uri(tag_uri)
  })
}

/**
 * Apply tag redaction to a single task object
 *
 * @param {Object} params
 * @param {Object} params.task - Task object with tags
 * @param {Object} params.uri_to_key_map - Map from original URI to visibility key
 * @returns {Object} Task with redacted tags
 */
const redact_task_tags = ({ task, uri_to_key_map }) => {
  // Handle nested structure (entity_properties.tags)
  if (task.entity_properties?.tags) {
    return {
      ...task,
      entity_properties: {
        ...task.entity_properties,
        tags: redact_tags_array({
          tags: task.entity_properties.tags,
          uri_to_key_map
        })
      }
    }
  }

  // Handle flat structure (tags at root level)
  if (task.tags) {
    return {
      ...task,
      tags: redact_tags_array({ tags: task.tags, uri_to_key_map })
    }
  }

  return task
}

/**
 * Process tasks with tag redaction applied
 *
 * Collects unique tags from all tasks, computes visibility,
 * and applies redaction to all task tag arrays.
 *
 * @param {Object} params
 * @param {Object[]} params.tasks - Array of task objects
 * @param {string|null} params.user_public_key - User's public key (null for public access)
 * @returns {Promise<{tasks: Object[], tag_visibility: Object}>}
 */
export const apply_tag_redaction_to_tasks = async ({
  tasks,
  user_public_key
}) => {
  if (!tasks || tasks.length === 0) {
    return { tasks: [], tag_visibility: {} }
  }

  // Collect all unique tag URIs from tasks
  const tag_uris = collect_unique_tag_uris(tasks)

  // Compute visibility and get mapping
  const { visibility_map, uri_to_key_map } = await compute_tag_visibility({
    tag_uris: [...tag_uris],
    user_public_key
  })

  // Apply redaction to each task's tags
  const redacted_tasks = tasks.map((task) =>
    redact_task_tags({ task, uri_to_key_map })
  )

  return {
    tasks: redacted_tasks,
    tag_visibility: visibility_map
  }
}
