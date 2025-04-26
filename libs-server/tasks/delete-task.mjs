import db from '#db'

/**
 * Delete or archive a task
 * @param {Object} params Task deletion parameters
 * @param {String} params.task_id ID of the task to delete
 * @param {String} params.user_id ID of the user who owns the task
 * @param {Boolean} params.permanent Whether to permanently delete the task
 * @returns {Boolean} Success indicator
 */
export default async function delete_task({
  task_id,
  user_id,
  permanent = false
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

    if (permanent) {
      // Permanent deletion - delete all related data first

      // Delete entity tags
      await trx('entity_tags').where({ entity_id: task_id }).delete()

      // Delete entity relations where this task is the source
      await trx('entity_relations')
        .where({ source_entity_id: task_id })
        .delete()

      // Delete entity relations where this task is the target
      await trx('entity_relations')
        .where({ target_entity_id: task_id })
        .delete()

      // Delete any task-specific metadata
      await trx('entity_metadata').where({ entity_id: task_id }).delete()

      // Delete any observations
      await trx('entity_observations').where({ entity_id: task_id }).delete()

      // Delete any blocks
      await trx('entity_blocks').where({ entity_id: task_id }).delete()

      // Delete the task record
      await trx('tasks').where({ entity_id: task_id }).delete()

      // Delete the entity record
      await trx('entities').where({ entity_id: task_id }).delete()
    } else {
      // Soft deletion - mark as archived
      await trx('entities').where({ entity_id: task_id }).update({
        archived_at: new Date(),
        updated_at: new Date()
      })
    }

    return true
  })
}
