import debug from 'debug'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'
import {
  resolve_entity_relations,
  find_entities_with_relations_to
} from '#libs-server/entity/relationships/base-uri-resolver.mjs'

const log = debug('task:filesystem:list')

/**
 * List tasks from the filesystem based on provided filters
 * This replaces the database-based task listing with file-based operations
 *
 * @param {Object} params - Query parameters
 * @param {string} params.user_id - User ID to filter tasks by
 * @param {string} [params.status] - Task status to filter by
 * @param {Array<string>} [params.tag_entity_ids=[]] - Tag entity IDs to filter by
 * @param {Array<string>} [params.organization_ids=[]] - Organization IDs to filter by
 * @param {Array<string>} [params.person_ids=[]] - Person IDs to filter by
 * @param {string} [params.min_finish_by] - Minimum finish_by date
 * @param {string} [params.max_finish_by] - Maximum finish_by date
 * @param {number} [params.min_estimated_total_duration] - Minimum estimated total duration
 * @param {number} [params.max_estimated_total_duration] - Maximum estimated total duration
 * @param {string} [params.min_planned_start] - Minimum planned start date
 * @param {string} [params.max_planned_start] - Maximum planned start date
 * @param {string} [params.min_planned_finish] - Minimum planned finish date
 * @param {string} [params.max_planned_finish] - Maximum planned finish date
 * @param {boolean} [params.archived=false] - Whether to include archived tasks
 * @returns {Promise<Array>} - List of tasks matching the filters
 */
export async function list_tasks_from_filesystem({
  user_id,
  status,
  tag_entity_ids = [],
  organization_ids = [],
  person_ids = [],
  min_finish_by,
  max_finish_by,
  min_estimated_total_duration,
  max_estimated_total_duration,
  min_planned_start,
  max_planned_start,
  min_planned_finish,
  max_planned_finish,
  archived = false
}) {
  try {
    log(`Listing tasks from filesystem for user ${user_id}`)

    // Use the proper entity listing function that handles entity validation and type filtering
    const task_entities = await list_entity_files_from_filesystem({
      include_entity_types: ['task'],
      include_path_patterns: ['task/**/*.md'] // Focus on task directory
    })

    const matching_tasks = []

    for (const entity_file of task_entities) {
      try {
        const { entity_properties } = entity_file

        // Skip if not belonging to the user
        if (entity_properties.user_id !== user_id) {
          continue
        }

        // Apply filters
        if (
          !passes_filters(entity_properties, {
            status,
            tag_entity_ids,
            organization_ids,
            person_ids,
            min_finish_by,
            max_finish_by,
            min_estimated_total_duration,
            max_estimated_total_duration,
            min_planned_start,
            max_planned_start,
            min_planned_finish,
            max_planned_finish,
            archived
          })
        ) {
          continue
        }

        // Get formatted metadata from the entity properties
        // Note: The list_entity_files_from_filesystem already parsed this for us
        const formatted_entity_metadata = {
          relations: entity_properties.relations || []
        }

        // Resolve relationships to get related entity IDs
        const resolved_relations = await resolve_entity_relations({
          relations: formatted_entity_metadata.relations
        })

        // Build the task object using base_uri as primary identifier
        const task = {
          task_id: entity_properties.base_uri, // Use base_uri as primary ID
          title: entity_properties.title,
          description: entity_properties.description,
          user_id: entity_properties.user_id,
          base_uri: entity_properties.base_uri,
          created_at: entity_properties.created_at,
          updated_at: entity_properties.updated_at,
          // Task-specific properties from frontmatter
          status: entity_properties.status,
          priority: entity_properties.priority,
          assigned_to: entity_properties.assigned_to,
          start_by: entity_properties.start_by,
          finish_by: entity_properties.finish_by,
          estimated_total_duration: entity_properties.estimated_total_duration,
          estimated_preparation_duration:
            entity_properties.estimated_preparation_duration,
          estimated_execution_duration:
            entity_properties.estimated_execution_duration,
          estimated_cleanup_duration:
            entity_properties.estimated_cleanup_duration,
          actual_duration: entity_properties.actual_duration,
          planned_start: entity_properties.planned_start,
          planned_finish: entity_properties.planned_finish,
          started_at: entity_properties.started_at,
          finished_at: entity_properties.finished_at,
          snooze_until: entity_properties.snooze_until,
          // Relationship-based arrays (now using base_uri)
          parent_task_base_uris: extract_relation_targets(
            resolved_relations,
            'subtask_of'
          ),
          child_task_base_uris: await get_child_tasks(
            entity_properties.base_uri
          ),
          tag_base_uris: extract_relation_targets(
            resolved_relations,
            'has_tag'
          ),
          observation_base_uris: extract_relation_targets(
            resolved_relations,
            'has_observation'
          ),
          metadata_base_uris: extract_relation_targets(
            resolved_relations,
            'has_metadata'
          ),
          block_base_uris: extract_relation_targets(
            resolved_relations,
            'has_block'
          )
        }

        matching_tasks.push(task)
      } catch (error) {
        log('Error processing task entity:', error.message)
      }
    }

    log(`Found ${matching_tasks.length} matching tasks`)
    return matching_tasks
  } catch (error) {
    log('Error listing tasks from filesystem:', error)
    throw error
  }
}

/**
 * Check if a task passes the given filters
 * @param {Object} entity_properties - The task properties
 * @param {Object} filters - The filter criteria
 * @returns {boolean} - True if task passes all filters
 */
function passes_filters(entity_properties, filters) {
  const {
    status,
    min_finish_by,
    max_finish_by,
    min_estimated_total_duration,
    max_estimated_total_duration,
    min_planned_start,
    max_planned_start,
    min_planned_finish,
    max_planned_finish,
    archived
  } = filters

  // Status filter
  if (status && entity_properties.status !== status) {
    return false
  }

  // Archived filter
  if (!archived && entity_properties.archived === true) {
    return false
  }

  // Date range filters
  if (
    min_finish_by &&
    entity_properties.finish_by &&
    entity_properties.finish_by < min_finish_by
  ) {
    return false
  }
  if (
    max_finish_by &&
    entity_properties.finish_by &&
    entity_properties.finish_by > max_finish_by
  ) {
    return false
  }

  // Duration filters
  if (
    min_estimated_total_duration &&
    entity_properties.estimated_total_duration &&
    entity_properties.estimated_total_duration < min_estimated_total_duration
  ) {
    return false
  }
  if (
    max_estimated_total_duration &&
    entity_properties.estimated_total_duration &&
    entity_properties.estimated_total_duration > max_estimated_total_duration
  ) {
    return false
  }

  // Planned date filters
  if (
    min_planned_start &&
    entity_properties.planned_start &&
    entity_properties.planned_start < min_planned_start
  ) {
    return false
  }
  if (
    max_planned_start &&
    entity_properties.planned_start &&
    entity_properties.planned_start > max_planned_start
  ) {
    return false
  }
  if (
    min_planned_finish &&
    entity_properties.planned_finish &&
    entity_properties.planned_finish < min_planned_finish
  ) {
    return false
  }
  if (
    max_planned_finish &&
    entity_properties.planned_finish &&
    entity_properties.planned_finish > max_planned_finish
  ) {
    return false
  }

  // Note: tag_entity_ids, organization_ids, person_ids filtering would require
  // resolving relations, which is done at a higher level
  // For now, we'll implement basic property-based filtering

  return true
}

/**
 * Extract target base_uris for a specific relation type
 * @param {Array} resolved_relations - Array of resolved relations
 * @param {string} relation_type - The relation type to extract
 * @returns {Array} - Array of target base_uris
 */
function extract_relation_targets(resolved_relations, relation_type) {
  return resolved_relations
    .filter((relation) => relation.relation_type === relation_type)
    .map((relation) => relation.target_base_uri)
}

/**
 * Find child tasks (tasks that have subtask_of relation pointing to this task)
 * @param {string} parent_base_uri - The parent task base_uri
 * @returns {Promise<Array>} - Array of child task base_uris
 */
async function get_child_tasks(parent_base_uri) {
  try {
    const child_entities = await find_entities_with_relations_to({
      target_base_uri: parent_base_uri,
      relation_type: 'subtask_of',
      entity_types: ['task']
    })

    return child_entities.map((entity) => entity.base_uri)
  } catch (error) {
    log(`Error finding child tasks for ${parent_base_uri}:`, error.message)
    return []
  }
}

export default {
  list_tasks_from_filesystem
}
