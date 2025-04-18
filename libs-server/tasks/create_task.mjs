import db from '#db'
import {
  RELATION_DEPENDS_ON,
  RELATION_CHILD_OF,
  RELATION_INVOLVES,
  RELATION_ASSIGNED_TO,
  RELATION_REQUIRES
} from '#libs-shared'

export default async function ({
  title,
  description = '',
  user_id,
  finish_by,
  planned_start,
  planned_finish,
  status = 'No status',
  priority = null,
  estimated_total_duration = null,
  estimated_preparation_duration = null,
  estimated_execution_duration = null,
  estimated_cleanup_duration = null,

  dependent_on_task_ids = [],
  parent_task_ids = [],
  tag_ids = [],
  organization_ids = [],
  person_ids = [],
  physical_item_ids = [],
  digital_item_ids = []
}) {
  // Start a transaction for consistency
  return db.transaction(async (trx) => {
    // 1. Create the entity record first
    const [entity] = await trx('entities')
      .insert({
        title,
        description,
        user_id,
        type: 'task',
        permalink: null // Can be generated if needed
      })
      .returning('entity_id')

    const entity_id = entity.entity_id

    // 2. Create the task record with the entity_id
    await trx('tasks').insert({
      entity_id,
      status,
      priority,
      finish_by,
      planned_start,
      planned_finish,
      estimated_total_duration,
      estimated_preparation_duration,
      estimated_execution_duration,
      estimated_cleanup_duration
    })

    // 3. Create entity_relations for dependencies (task depends on other tasks)
    if (dependent_on_task_ids.length > 0) {
      const dependent_relations = dependent_on_task_ids.map(
        (dependent_task_id) => ({
          source_entity_id: entity_id,
          target_entity_id: dependent_task_id,
          relation_type: RELATION_DEPENDS_ON
        })
      )

      await trx('entity_relations').insert(dependent_relations)
    }

    // 4. Create entity_relations for parent-child relationships (task is child of parent tasks)
    if (parent_task_ids.length > 0) {
      const parent_relations = parent_task_ids.map((parent_task_id) => ({
        source_entity_id: entity_id,
        target_entity_id: parent_task_id,
        relation_type: RELATION_CHILD_OF
      }))

      await trx('entity_relations').insert(parent_relations)
    }

    // 5. Create entity_tags for tag relationships
    if (tag_ids.length > 0) {
      const tag_relations = tag_ids.map((tag_id) => ({
        entity_id,
        tag_entity_id: tag_id
      }))

      await trx('entity_tags').insert(tag_relations)
    }

    // 6. Create entity_relations for organizations (involves relationship)
    if (organization_ids.length > 0) {
      const org_relations = organization_ids.map((organization_id) => ({
        source_entity_id: entity_id,
        target_entity_id: organization_id,
        relation_type: RELATION_INVOLVES
      }))

      await trx('entity_relations').insert(org_relations)
    }

    // 7. Create entity_relations for persons (assigned_to relationship)
    if (person_ids.length > 0) {
      const person_relations = person_ids.map((person_id) => ({
        source_entity_id: entity_id,
        target_entity_id: person_id,
        relation_type: RELATION_ASSIGNED_TO
      }))

      await trx('entity_relations').insert(person_relations)
    }

    // 8. Create entity_relations for physical items (requires relationship)
    if (physical_item_ids.length > 0) {
      const physical_item_relations = physical_item_ids.map(
        (physical_item_id) => ({
          source_entity_id: entity_id,
          target_entity_id: physical_item_id,
          relation_type: RELATION_REQUIRES
        })
      )

      await trx('entity_relations').insert(physical_item_relations)
    }

    // 9. Create entity_relations for digital items (requires relationship)
    if (digital_item_ids.length > 0) {
      const digital_item_relations = digital_item_ids.map(
        (digital_item_id) => ({
          source_entity_id: entity_id,
          target_entity_id: digital_item_id,
          relation_type: RELATION_REQUIRES
        })
      )

      await trx('entity_relations').insert(digital_item_relations)
    }

    return entity_id
  })
}
