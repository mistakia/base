import db from '#db'

/**
 * Creates a base entity in the database
 *
 * @param {Object} params Entity creation parameters
 * @param {string} params.title Entity title
 * @param {string} params.type Entity type (task, tag, person, etc.)
 * @param {string} params.user_id User who owns the entity
 * @param {string} [params.description=''] Optional entity description
 * @param {string} [params.permalink=null] Optional permalink
 * @param {Object} [params.frontmatter=null] Optional frontmatter data
 * @param {string} [params.markdown=null] Optional markdown content
 * @param {string} [params.content=null] Optional parsed content
 * @returns {Promise<string>} The created entity_id
 */
export async function create_entity({
  title,
  type,
  user_id,
  description = '',
  permalink = null,
  frontmatter = null,
  markdown = null,
  content = null,
  trx = null
}) {
  const db_client = trx || db

  const [entity] = await db_client('entities')
    .insert({
      title,
      description,
      type,
      user_id,
      permalink,
      frontmatter,
      markdown,
      content,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('entity_id')

  return entity.entity_id
}

/**
 * Creates entity relations
 *
 * @param {Object} params Relation creation parameters
 * @param {string} params.source_entity_id Source entity ID
 * @param {string[]} params.target_entity_ids Target entity IDs
 * @param {string} params.relation_type Relation type
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<void>}
 */
export async function create_entity_relations({
  source_entity_id,
  target_entity_ids,
  relation_type,
  trx = null
}) {
  if (!target_entity_ids || target_entity_ids.length === 0) return

  const db_client = trx || db

  const relations = target_entity_ids.map((target_entity_id) => ({
    source_entity_id,
    target_entity_id,
    relation_type,
    created_at: new Date()
  }))

  await db_client('entity_relations').insert(relations)
}

/**
 * Creates entity tag relationships
 *
 * @param {Object} params Tag relation creation parameters
 * @param {string} params.entity_id Entity ID
 * @param {string[]} params.tag_entity_ids Tag entity IDs
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<void>}
 */
export async function create_entity_tags({
  entity_id,
  tag_entity_ids,
  trx = null
}) {
  if (!tag_entity_ids || tag_entity_ids.length === 0) return

  const db_client = trx || db

  const tag_relations = tag_entity_ids.map((tag_entity_id) => ({
    entity_id,
    tag_entity_id
  }))

  await db_client('entity_tags').insert(tag_relations)
}

export default {
  create_entity,
  create_entity_relations,
  create_entity_tags
}
