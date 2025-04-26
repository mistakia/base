import db from '#db'

export default async function ({
  user_id,
  status,
  tag_ids = [],
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
      // Parent task IDs
      db.raw(`(
        SELECT array_agg(parent_task_id)
        FROM task_parent_child_view
        WHERE child_task_id = e.entity_id
      ) as parent_task_ids`),
      // Child task IDs
      db.raw(`(
        SELECT array_agg(child_task_id)
        FROM task_parent_child_view
        WHERE parent_task_id = e.entity_id
      ) as child_task_ids`),
      // Tag entity IDs
      db.raw(`(
        SELECT array_agg(tag_entity_id)
        FROM entity_tags
        WHERE entity_id = e.entity_id
      ) as tag_entity_ids`),
      // Observation entity IDs
      db.raw(`(
        SELECT array_agg(observation_id)
        FROM entity_observations
        WHERE entity_id = e.entity_id
      ) as observation_entity_ids`),
      // Metadata entity IDs
      db.raw(`(
        SELECT array_agg(metadata_id)
        FROM entity_metadata
        WHERE entity_id = e.entity_id
      ) as metadata_entity_ids`),
      // Block entity IDs
      db.raw(`(
        SELECT array_agg(block_id)
        FROM entity_blocks
        WHERE entity_id = e.entity_id
      ) as block_entity_ids`),
      // Blocked task IDs (tasks that cannot start until this task is completed)
      db.raw(`(
        SELECT array_agg(task_entity_id)
        FROM task_dependencies_view
        WHERE dependent_task_entity_id = e.entity_id
      ) as blocked_task_ids`),
      // Blocking task IDs (tasks that must be completed before this task can start)
      db.raw(`(
        SELECT array_agg(dependent_task_entity_id)
        FROM task_dependencies_view
        WHERE task_entity_id = e.entity_id
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

  // Filter by tags using entity_tags junction table
  if (tag_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('entity_tags')
        .whereRaw('entity_tags.entity_id = e.entity_id')
        .whereIn('entity_tags.tag_entity_id', tag_ids)
    })
  }

  // Filter by organizations using task_organizations_view
  if (organization_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('task_organizations_view')
        .whereRaw('task_organizations_view.task_id = e.entity_id')
        .whereIn('task_organizations_view.organization_id', organization_ids)
    })
  }

  // Filter by persons using task_persons_view
  if (person_ids.length > 0) {
    query.whereExists(function () {
      this.select('*')
        .from('task_persons_view')
        .whereRaw('task_persons_view.task_id = e.entity_id')
        .whereIn('task_persons_view.person_id', person_ids)
    })
  }

  return query
}
