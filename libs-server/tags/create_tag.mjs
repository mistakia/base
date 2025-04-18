import db from '#db'
import { create_entity } from '#libs-server/entities/index.mjs'

/**
 * Creates a new tag entity
 *
 * @param {Object} params - Parameters for creating a tag
 * @param {string} params.title - The tag name
 * @param {string} params.description - Optional tag description
 * @param {string} params.user_id - The user ID who owns this tag
 * @param {string} params.color - Optional color for the tag
 * @returns {Promise<string>} - The created tag's entity_id
 */
export default async function create_tag({
  title,
  description = '',
  user_id,
  color = null
}) {
  // Start a transaction for consistency
  return db.transaction(async (trx) => {
    // 1. Create the entity record using the entity service
    const entity_id = await create_entity({
      title,
      description,
      type: 'tag',
      user_id,
      trx
    })

    // 2. Create the tag record with the entity_id
    await trx('tags').insert({
      entity_id,
      color
    })

    return entity_id
  })
}
