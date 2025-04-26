import db from '#db'
import { entity_relations } from '#libs-shared'
import {
  update_entity,
  create_entity_relations,
  create_entity_tags,
  delete_entity_relations,
  delete_entity_tags
} from '#libs-server/entities/index.mjs'

const {
  RELATION_DEPENDS_ON,
  RELATION_CHILD_OF,
  RELATION_INVOLVES,
  RELATION_ASSIGNED_TO,
  RELATION_REQUIRES
} = entity_relations

/**
 * Update an existing task
 * @param {Object} params Task update parameters
 * @returns {String} Updated task ID
 */
export default async function update_task({
  task_id,
  user_id,
  title,
  description,
  status,
  priority,
  finish_by,
  planned_start,
  planned_finish,
  estimated_total_duration,
  estimated_preparation_duration,
  estimated_execution_duration,
  estimated_cleanup_duration,

  dependent_on_task_ids,
  parent_task_ids,
  tag_ids,
  organization_ids,
  person_ids,
  physical_item_ids,
  digital_item_ids,
  blocking_task_ids
}) {
  // Start a transaction for consistency
  return db.transaction(async (trx) => {
    // 1. Verify task exists and belongs to user
    const task_entity = await trx('entities')
      .where({ entity_id: task_id, user_id, type: 'task' })
      .first()

    if (!task_entity) {
      throw new Error('Task not found or access denied')
    }

    // 2. Update entity data if provided
    const entity_updates = {}
    if (title !== undefined) entity_updates.title = title
    if (description !== undefined) entity_updates.description = description

    if (Object.keys(entity_updates).length > 0) {
      await update_entity({
        entity_id: task_id,
        ...entity_updates,
        trx
      })
    }

    // 3. Update task-specific data if provided
    const task_updates = {}
    if (status !== undefined) task_updates.status = status
    if (priority !== undefined) task_updates.priority = priority
    if (finish_by !== undefined) task_updates.finish_by = finish_by
    if (planned_start !== undefined) task_updates.planned_start = planned_start
    if (planned_finish !== undefined)
      task_updates.planned_finish = planned_finish
    if (estimated_total_duration !== undefined)
      task_updates.estimated_total_duration = estimated_total_duration
    if (estimated_preparation_duration !== undefined)
      task_updates.estimated_preparation_duration =
        estimated_preparation_duration
    if (estimated_execution_duration !== undefined)
      task_updates.estimated_execution_duration = estimated_execution_duration
    if (estimated_cleanup_duration !== undefined)
      task_updates.estimated_cleanup_duration = estimated_cleanup_duration

    if (Object.keys(task_updates).length > 0) {
      await trx('tasks').where({ entity_id: task_id }).update(task_updates)
    }

    // 4. Update entity relationships if provided

    // 4.1 Update dependencies (task depends on other tasks)
    if (dependent_on_task_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_DEPENDS_ON,
        target_entity_type: 'task',
        trx
      })

      // Add new relations
      if (dependent_on_task_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: dependent_on_task_ids,
          relation_type: RELATION_DEPENDS_ON,
          trx
        })
      }
    }

    // 4.2 Update parent-child relationships
    if (parent_task_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_CHILD_OF,
        target_entity_type: 'task',
        trx
      })

      // Add new relations
      if (parent_task_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: parent_task_ids,
          relation_type: RELATION_CHILD_OF,
          trx
        })
      }
    }

    // 4.3 Update blocking tasks
    if (blocking_task_ids !== undefined) {
      // Blocking is the inverse of dependency:
      // If A blocks B, then B depends on A

      // First, remove existing relations where other tasks depend on this task
      await delete_entity_relations({
        target_entity_id: task_id,
        relation_type: RELATION_DEPENDS_ON,
        source_entity_type: 'task',
        trx
      })

      // Add new relations (other tasks depend on this task)
      if (blocking_task_ids.length > 0) {
        // For each task that is blocked by this task
        for (const blocked_task_id of blocking_task_ids) {
          await create_entity_relations({
            source_entity_id: blocked_task_id,
            target_entity_ids: [task_id],
            relation_type: RELATION_DEPENDS_ON,
            trx
          })
        }
      }
    }

    // 4.4 Update tag relationships
    if (tag_ids !== undefined) {
      // Remove existing tags
      await delete_entity_tags({
        entity_id: task_id,
        trx
      })

      // Add new tags
      if (tag_ids.length > 0) {
        await create_entity_tags({
          entity_id: task_id,
          tag_entity_ids: tag_ids,
          trx
        })
      }
    }

    // 4.5 Update organization relations
    if (organization_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_INVOLVES,
        target_entity_type: 'organization',
        trx
      })

      // Add new relations
      if (organization_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: organization_ids,
          relation_type: RELATION_INVOLVES,
          trx
        })
      }
    }

    // 4.6 Update person relations
    if (person_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_ASSIGNED_TO,
        target_entity_type: 'person',
        trx
      })

      // Add new relations
      if (person_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: person_ids,
          relation_type: RELATION_ASSIGNED_TO,
          trx
        })
      }
    }

    // 4.7 Update physical item relations
    if (physical_item_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_REQUIRES,
        target_entity_type: 'physical_item',
        trx
      })

      // Add new relations
      if (physical_item_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: physical_item_ids,
          relation_type: RELATION_REQUIRES,
          trx
        })
      }
    }

    // 4.8 Update digital item relations
    if (digital_item_ids !== undefined) {
      // Remove existing relations
      await delete_entity_relations({
        source_entity_id: task_id,
        relation_type: RELATION_REQUIRES,
        target_entity_type: 'digital_item',
        trx
      })

      // Add new relations
      if (digital_item_ids.length > 0) {
        await create_entity_relations({
          source_entity_id: task_id,
          target_entity_ids: digital_item_ids,
          relation_type: RELATION_REQUIRES,
          trx
        })
      }
    }

    return task_id
  })
}
