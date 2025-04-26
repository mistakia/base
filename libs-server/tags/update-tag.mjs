import db from '#db'

/**
 * Updates an existing tag
 *
 * @param {Object} params - Parameters for updating a tag
 * @param {string} params.tag_id - The tag's entity ID
 * @param {string} params.user_id - The user ID who owns this tag
 * @param {string} [params.title] - Optional new title for the tag
 * @param {string} [params.description] - Optional new description
 * @param {string} [params.color] - Optional new color
 * @param {boolean} [params.archive] - Whether to archive this tag
 * @returns {Promise<boolean>} - Whether the update was successful
 */
export default async function update_tag({
  tag_id,
  user_id,
  title,
  description,
  color,
  archive
}) {
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

    // Update entity fields if provided
    const entity_updates = {}

    if (title !== undefined) {
      entity_updates.title = title
    }

    if (description !== undefined) {
      entity_updates.description = description
    }

    if (archive !== undefined) {
      entity_updates.archived_at = archive ? new Date() : null
    }

    if (Object.keys(entity_updates).length > 0) {
      entity_updates.updated_at = new Date()

      await trx('entities').where({ entity_id: tag_id }).update(entity_updates)
    }

    // Update tag-specific fields if provided
    if (color !== undefined) {
      await trx('tags').where({ entity_id: tag_id }).update({ color })
    }

    return true
  })
}
