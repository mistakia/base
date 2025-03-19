import db from '#db'
import PropTypes from 'prop-types'

export default async function GetTask({ task_id }) {
  // Get the task from the entities and tasks tables
  const task = await db('entities as e')
    .join('tasks as t', 'e.entity_id', 't.entity_id')
    .where('e.entity_id', task_id)
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
      't.snooze_until'
    )
    .first()

  if (!task) {
    return null
  }

  // Get dependencies using task_dependencies_view
  const dependent_on = await db('task_dependencies_view')
    .where({ task_entity_id: task_id })
    .select('dependent_task_entity_id as task_id')

  // Get tasks that depend on this task
  const dependent_for = await db('task_dependencies_view')
    .where({ dependent_task_entity_id: task_id })
    .select('task_entity_id as task_id')

  // Get child tasks using task_parent_child_view
  const children = await db('task_parent_child_view')
    .where({ parent_task_id: task_id })
    .select('child_task_id as task_id')

  // Get parent tasks using task_parent_child_view
  const parents = await db('task_parent_child_view')
    .where({ child_task_id: task_id })
    .select('parent_task_id as task_id')

  // Get tags using entity_tags table
  const task_tags = await db('entity_tags')
    .where({ entity_id: task_id })
    .select('tag_entity_id as tag_id')

  // Get organizations using task_organizations_view
  const task_organizations = await db('task_organizations_view')
    .where({ task_id })
    .select('organization_id')

  // Get persons using task_persons_view
  const task_persons = await db('task_persons_view')
    .where({ task_id })
    .select('person_id')

  // Get physical items using task_physical_items_view
  const task_physical_items = await db('task_physical_items_view')
    .where({ task_id })
    .select('physical_item_id')

  // Get digital items using task_digital_items_view
  const task_digital_items = await db('task_digital_items_view')
    .where({ task_id })
    .select('digital_item_id')

  return {
    ...task,
    dependent_on: dependent_on.map(
      ({ dependent_task_entity_id }) => dependent_task_entity_id
    ),
    dependent_for: dependent_for.map(({ task_entity_id }) => task_entity_id),
    children_task_ids: children.map(({ child_task_id }) => child_task_id),
    parents_task_ids: parents.map(({ parent_task_id }) => parent_task_id),
    tag_ids: task_tags.map(({ tag_entity_id }) => tag_entity_id),
    organization_ids: task_organizations.map(
      ({ organization_id }) => organization_id
    ),
    person_ids: task_persons.map(({ person_id }) => person_id),
    physical_item_ids: task_physical_items.map(
      ({ physical_item_id }) => physical_item_id
    ),
    digital_item_ids: task_digital_items.map(
      ({ digital_item_id }) => digital_item_id
    )
  }
}

GetTask.propTypes = {
  task_id: PropTypes.string.isRequired
}
