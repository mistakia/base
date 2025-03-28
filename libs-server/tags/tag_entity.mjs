import db from '#db'

/**
 * Associates an entity with a tag
 *
 * @param {Object} params - Parameters for tagging an entity
 * @param {string} params.entity_id - The entity ID to tag
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns both entities
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function tag_entity({ entity_id, tag_id, user_id }) {
  return db.transaction(async (trx) => {
    // Verify both entities exist and belong to this user
    const [entity, tag] = await Promise.all([
      trx('entities')
        .where({
          entity_id,
          user_id
        })
        .first(),
      trx('entities')
        .where({
          entity_id: tag_id,
          user_id,
          type: 'tag'
        })
        .first()
    ])

    if (!entity || !tag) {
      return false
    }

    // Check if the relationship already exists
    const existing = await trx('entity_tags')
      .where({
        entity_id,
        tag_entity_id: tag_id
      })
      .first()

    if (existing) {
      return true // Already tagged, no need to create duplicate
    }

    // Create the tag relationship
    await trx('entity_tags').insert({
      entity_id,
      tag_entity_id: tag_id
    })

    return true
  })
}

/**
 * Removes a tag association from an entity
 *
 * @param {Object} params - Parameters for untagging an entity
 * @param {string} params.entity_id - The entity ID to untag
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns both entities
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function untag_entity({ entity_id, tag_id, user_id }) {
  return db.transaction(async (trx) => {
    // Verify both entities exist and belong to this user
    const [entity, tag] = await Promise.all([
      trx('entities')
        .where({
          entity_id,
          user_id
        })
        .first(),
      trx('entities')
        .where({
          entity_id: tag_id,
          user_id,
          type: 'tag'
        })
        .first()
    ])

    if (!entity || !tag) {
      return false
    }

    // Delete the tag relationship
    await trx('entity_tags')
      .where({
        entity_id,
        tag_entity_id: tag_id
      })
      .delete()

    return true
  })
}

export default {
  tag_entity,
  untag_entity
}
