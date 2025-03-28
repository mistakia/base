import db from '#db'

/**
 * Deletes a tag entity and removes all associations
 *
 * @param {Object} params - Parameters for deleting a tag
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns this tag
 * @returns {Promise<boolean>} - Whether the delete was successful
 */
export default async function delete_tag({ tag_id, user_id }) {
  return db.transaction(async (trx) => {
    // Make sure the tag exists and belongs to this user
    const tag = await trx('entities')
      .where({
        entity_id: tag_id,
        user_id,
        type: 'tag'
      })
      .first()

    if (!tag) {
      return false
    }

    // Remove all entity tag relationships first
    await trx('entity_tags').where({ tag_entity_id: tag_id }).delete()

    // Delete the tag record from tags table
    await trx('tags').where({ entity_id: tag_id }).delete()

    // Delete the entity record
    await trx('entities').where({ entity_id: tag_id }).delete()

    return true
  })
}
