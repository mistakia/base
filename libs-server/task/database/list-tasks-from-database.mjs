import db from '#db'

/**
 * List tasks from the database based on provided filters
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
export async function list_tasks_from_database({
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
  // Start with a query joining entities and tasks
  const query = db('entities as e')
    .join('tasks as t', 'e.entity_id', 't.entity_id')
    .where({ 'e.user_id': user_id, 'e.type': 'task' })
    .select(
      'e.entity_id as task_id',
      'e.title',
      'e.description',
      'e.user_id',
      'e.base_relative_path',
      'e.created_at',
      'e.updated_at',
      't.status',
      't.priority',
      't.assigned_to',
      't.start_by',
      't.finish_by',
      't.estimated_total_duration',
      't.estimated_preparation_duration',
      't.estimated_execution_duration',
      't.estimated_cleanup_duration',
      't.actual_duration',
      't.planned_start',
      't.planned_finish',
      't.started_at',
      't.finished_at',
      't.snooze_until',
      // Parent task IDs - using entity_relations with 'subtask_of' relation
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'subtask_of'
      ) as parent_task_ids`),
      // Child task IDs - using entity_relations with 'subtask_of' relation (reversed)
      db.raw(`(
        SELECT array_agg(source_entity_id)
        FROM entity_relations
        WHERE target_entity_id = e.entity_id AND relation_type = 'subtask_of'
      ) as child_task_ids`),
      // Tag entity IDs - using entity_relations
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'has_tag'
      ) as tag_entity_ids`),
      // Observation entity IDs - using entity_relations
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'has_observation'
      ) as observation_entity_ids`),
      // Metadata entity IDs - using entity_relations
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'has_metadata'
      ) as metadata_entity_ids`),
      // Block entity IDs - using entity_relations
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'has_block'
      ) as block_entity_ids`),
      // Blocked task IDs - using entity_relations with 'blocks' relation
      db.raw(`(
        SELECT array_agg(target_entity_id)
        FROM entity_relations
        WHERE source_entity_id = e.entity_id AND relation_type = 'blocks'
      ) as blocked_task_ids`),
      // Blocking task IDs - using entity_relations with 'blocks' relation (reversed)
      db.raw(`(
        SELECT array_agg(source_entity_id)
        FROM entity_relations
        WHERE target_entity_id = e.entity_id AND relation_type = 'blocks'
      ) as blocking_task_ids`)
    )

  // Filter by archived status
  if (archived) {
    query.whereNotNull('e.archived_at')
  } else {
    query.whereNull('e.archived_at')
  }

  // Filter by task status
  if (status) {
    query.where({ 't.status': status })
  }

  // Apply time-based filters
  if (min_finish_by) {
    query.where('t.finish_by', '>=', min_finish_by)
  }

  if (max_finish_by) {
    query.where('t.finish_by', '<=', max_finish_by)
  }

  if (min_estimated_total_duration) {
    query.where(
      't.estimated_total_duration',
      '>=',
      min_estimated_total_duration
    )
  }

  if (max_estimated_total_duration) {
    query.where(
      't.estimated_total_duration',
      '<=',
      max_estimated_total_duration
    )
  }

  if (min_planned_start) {
    query.where('t.planned_start', '>=', min_planned_start)
  }

  if (max_planned_start) {
    query.where('t.planned_start', '<=', max_planned_start)
  }

  if (min_planned_finish) {
    query.where('t.planned_finish', '>=', min_planned_finish)
  }

  if (max_planned_finish) {
    query.where('t.planned_finish', '<=', max_planned_finish)
  }

  // Filter by tags using entity_relations table
  if (tag_entity_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('entity_relations')
        .whereRaw('entity_relations.source_entity_id = e.entity_id')
        .where('entity_relations.relation_type', '=', 'has_tag')
        .whereIn('entity_relations.target_entity_id', tag_entity_ids)
    })
  }

  // Filter by organizations using entity_relations table
  if (organization_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('entity_relations')
        .whereRaw('entity_relations.source_entity_id = e.entity_id')
        .where('entity_relations.relation_type', '=', 'involves')
        .whereIn('entity_relations.target_entity_id', organization_ids)
    })
  }

  // Filter by persons using entity_relations table
  if (person_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('entity_relations')
        .whereRaw('entity_relations.source_entity_id = e.entity_id')
        .where('entity_relations.relation_type', '=', 'assigned_to')
        .whereIn('entity_relations.target_entity_id', person_ids)
    })
  }

  return query
}
