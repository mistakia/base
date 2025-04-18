import db from '#db'
import { entity_relations } from '#libs-shared'
import {
  create_entity,
  create_entity_relations,
  create_entity_tags
} from '#libs-server/entities/index.mjs'

const {
  RELATION_DEPENDS_ON,
  RELATION_CHILD_OF,
  RELATION_INVOLVES,
  RELATION_ASSIGNED_TO,
  RELATION_REQUIRES
} = entity_relations

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
    // 1. Create the entity record using entity service
    const entity_id = await create_entity({
      title,
      description,
      type: 'task',
      user_id,
      trx
    })

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
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: dependent_on_task_ids,
        relation_type: RELATION_DEPENDS_ON,
        trx
      })
    }

    // 4. Create entity_relations for parent-child relationships
    if (parent_task_ids.length > 0) {
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: parent_task_ids,
        relation_type: RELATION_CHILD_OF,
        trx
      })
    }

    // 5. Create entity_tags for tag relationships
    if (tag_ids.length > 0) {
      await create_entity_tags({
        entity_id,
        tag_entity_ids: tag_ids,
        trx
      })
    }

    // 6. Create entity_relations for organizations
    if (organization_ids.length > 0) {
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: organization_ids,
        relation_type: RELATION_INVOLVES,
        trx
      })
    }

    // 7. Create entity_relations for persons
    if (person_ids.length > 0) {
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: person_ids,
        relation_type: RELATION_ASSIGNED_TO,
        trx
      })
    }

    // 8. Create entity_relations for physical items
    if (physical_item_ids.length > 0) {
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: physical_item_ids,
        relation_type: RELATION_REQUIRES,
        trx
      })
    }

    // 9. Create entity_relations for digital items
    if (digital_item_ids.length > 0) {
      await create_entity_relations({
        source_entity_id: entity_id,
        target_entity_ids: digital_item_ids,
        relation_type: RELATION_REQUIRES,
        trx
      })
    }

    return entity_id
  })
}
