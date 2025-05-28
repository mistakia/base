import db from '#db'
import debug from 'debug'
import { write_entity_relations_to_database } from './write-entity-relations-to-database.mjs'
import { write_entity_tags_to_database } from './write-entity-tags-to-database.mjs'
import { get_entity_id_from_base_path } from '#libs-server/entity/filesystem/get-entity-id-from-base-path.mjs'

const log = debug('entity:database:write')

/**
 * Validates required parameters for entity creation/update
 *
 * @param {Object} params Parameters to validate
 * @param {Object} params.entity_properties Properties of the entity
 * @param {string} params.entity_type Type of entity
 * @param {string} params.user_id User who owns the entity
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Path relative to repository base
 * @param {string} params.git_sha Git SHA of the file
 * @throws {Error} If any required parameter is missing
 */
function validate_entity_params({
  entity_properties,
  entity_type,
  user_id,
  absolute_path,
  base_relative_path,
  git_sha
}) {
  if (!entity_properties || typeof entity_properties !== 'object') {
    throw new Error('Entity properties must be a valid object')
  }

  if (!entity_type) {
    throw new Error('Entity type is required')
  }

  if (!user_id) {
    throw new Error('User ID is required')
  }

  if (!entity_properties.entity_id) {
    throw new Error('entity_properties.entity_id is required')
  }

  if (!absolute_path) {
    throw new Error('absolute_path is required')
  }

  if (!base_relative_path) {
    throw new Error('base_relative_path is required')
  }

  if (!git_sha) {
    throw new Error('git_sha is required')
  }
}

/**
 * Prepares entity data for database operations
 *
 * @param {Object} params Parameters for entity data preparation
 * @param {Object} params.entity_properties Properties of the entity
 * @param {string} params.entity_type Type of entity
 * @param {string} params.user_id User who owns the entity
 * @param {string} params.entity_content Entity content/markdown
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Path relative to repository base
 * @param {string} params.git_sha Git SHA of the file
 * @returns {Object} Formatted entity data for database operations
 */
function prepare_entity_data({
  entity_properties,
  entity_type,
  user_id,
  entity_content,
  absolute_path,
  base_relative_path,
  git_sha
}) {
  const entity_data = {
    title: entity_properties.title || 'Untitled',
    description: entity_properties.description || '',
    type: entity_type,
    user_id,
    markdown: entity_content || null,
    frontmatter: JSON.stringify(entity_properties),
    updated_at: entity_properties.updated_at || new Date(),
    absolute_path,
    base_relative_path,
    git_sha
  }

  // Add permalink if provided
  if (entity_properties.permalink) {
    entity_data.permalink = entity_properties.permalink
  }

  return entity_data
}

/**
 * Creates or updates an entity in the database
 *
 * @param {Object} params Entity creation parameters
 * @param {Object} params.entity_data Prepared entity data
 * @param {string} params.entity_id Entity ID
 * @param {Object} params.db_client Database client or transaction
 * @returns {Promise<boolean>} Whether the entity was created (true) or updated (false)
 */
async function create_or_update_entity({ entity_data, entity_id, db_client }) {
  // Check if entity exists in database
  const existing_entity = await db_client('entities')
    .where({ entity_id })
    .first()

  if (existing_entity) {
    // Update existing entity
    await db_client('entities').where({ entity_id }).update(entity_data)

    log(`Updated entity in database: ${entity_id}`)
    return false
  } else {
    // Insert with provided entity_id
    // Use created_at from entity_properties if it exists, otherwise use current time
    entity_data.created_at =
      entity_data.created_at || entity_data.updated_at || new Date()
    entity_data.entity_id = entity_id

    await db_client('entities').insert(entity_data)
    log(`Created new entity in database with provided ID: ${entity_id}`)
    return true
  }
}

/**
 * Processes entity relations and writes them to the database
 *
 * @param {Object} params Relation processing parameters
 * @param {string} params.entity_id Entity ID
 * @param {Object} params.formatted_entity_metadata Formatted metadata about the entity
 * @param {string} params.user_id User who owns the entity
 * @param {Object} params.db_client Database client or transaction
 * @returns {Promise<number>} Number of relations processed
 */
async function process_entity_relations({
  entity_id,
  formatted_entity_metadata,
  user_id,
  db_client
}) {
  if (!formatted_entity_metadata || !formatted_entity_metadata.relations) {
    return 0
  }

  // Convert relations to the format expected by write_entity_relations_to_database
  const structured_relations = []

  // Process each relation and convert entity paths to entity IDs
  for (const relation of formatted_entity_metadata.relations) {
    try {
      const result = await get_entity_id_from_base_path({
        base_relative_path: relation.entity_path
      })

      if (result.success && result.entity_id) {
        structured_relations.push({
          relation_type: relation.relation_type,
          entity_id: result.entity_id,
          context: relation.context
        })
        log(
          `Converted relation path ${relation.entity_path} to entity_id ${result.entity_id}`
        )
      } else {
        log(
          `Failed to convert relation path ${relation.entity_path}: ${result.error}`
        )
      }
    } catch (error) {
      log(
        `Error converting relation path to entity_id for ${relation.entity_path}:`,
        error
      )
    }
  }

  if (structured_relations.length > 0) {
    await write_entity_relations_to_database({
      entity_id,
      relations: structured_relations,
      user_id,
      db_client
    })
  }

  return structured_relations.length
}

/**
 * Converts tag paths to entity IDs
 *
 * @param {Object} params Tag conversion parameters
 * @param {string[]} params.tags Array of tag paths
 * @returns {Promise<Object[]>} Array of tag conversion results
 */
async function convert_tag_paths_to_entity_ids({ tags }) {
  return Promise.all(
    tags.map(async (tag) => {
      try {
        const result = await get_entity_id_from_base_path({
          base_relative_path: tag
        })
        if (result.success && result.entity_id) {
          log(`Converted tag path ${tag} to entity_id ${result.entity_id}`)
          return { success: true, entity_id: result.entity_id }
        } else {
          log(`Failed to convert tag path ${tag}: ${result.error}`)
          return { success: false, tag }
        }
      } catch (error) {
        log(`Error converting tag path to entity_id for ${tag}:`, error)
        return { success: false, tag }
      }
    })
  )
}

/**
 * Processes entity tags and writes them to the database
 *
 * @param {Object} params Tag processing parameters
 * @param {string} params.entity_id Entity ID
 * @param {string[]} params.tags Array of tag paths
 * @param {Object} params.db_client Database client or transaction
 * @returns {Promise<Object>} Tag processing results
 */
async function process_entity_tags({ entity_id, tags, db_client }) {
  if (!tags || tags.length === 0) {
    return { processed: 0, skipped: 0 }
  }

  // Convert tag paths to entity IDs
  const tag_results = await convert_tag_paths_to_entity_ids({ tags })

  // Filter out failed tag conversions
  const valid_tag_entity_ids = tag_results
    .filter((result) => result.success)
    .map((result) => result.entity_id)

  // Get skipped tags for logging
  const skipped_tags = tag_results
    .filter((result) => !result.success)
    .map((result) => result.tag)

  if (skipped_tags.length > 0) {
    log(
      `Skipped ${skipped_tags.length} tags that could not be resolved: ${skipped_tags.join(', ')}`
    )
  }

  // Write valid tags to database
  await write_entity_tags_to_database({
    entity_id,
    tag_entity_ids: valid_tag_entity_ids,
    db_client
  })

  return {
    processed: valid_tag_entity_ids.length,
    skipped: skipped_tags.length
  }
}

/**
 * Updates entity archive status if needed
 *
 * @param {Object} params Archive parameters
 * @param {string} params.entity_id Entity ID
 * @param {Date} [params.archived_at] Archive timestamp
 * @param {Object} params.db_client Database client or transaction
 * @returns {Promise<boolean>} Whether the entity was archived
 */
async function update_entity_archive_status({
  entity_id,
  archived_at,
  db_client
}) {
  if (!archived_at) {
    return false
  }

  await db_client('entities').where({ entity_id }).update({ archived_at })

  log(`Updated archive status for entity ${entity_id}`)
  return true
}

/**
 * Creates or updates an entity in the database
 *
 * @param {Object} params Entity creation parameters
 * @param {Object} params.entity_properties Properties of the entity
 * @param {string} params.entity_properties.title Title of the entity
 * @param {string} params.entity_properties.entity_id ID of the entity
 * @param {string} [params.entity_properties.description=''] Description of the entity
 * @param {string} [params.entity_properties.permalink=null] Custom URL path
 * @param {string[]} [params.entity_properties.tags=[]] Array of categorization tags
 * @param {string[]} [params.entity_properties.observations=[]] Array of structured observations
 * @param {string} params.entity_type Type of entity (task, guideline, activity, etc.)
 * @param {string} params.user_id User who owns the entity
 * @param {string} [params.entity_content=''] Optional entity content/markdown
 * @param {string} params.absolute_path Absolute path to the file (required)
 * @param {string} params.base_relative_path Path relative to repository base (required)
 * @param {string} params.git_sha Git SHA of the file (required)
 * @param {Object} [params.formatted_entity_metadata=null] Formatted metadata about the entity
 * @param {Object} [params.trx=null] Optional transaction object
 * @returns {Promise<string>} The entity_id
 */
export async function write_entity_to_database({
  entity_properties,
  entity_type,
  user_id,
  entity_content = '',
  absolute_path,
  base_relative_path,
  git_sha,
  formatted_entity_metadata = null,
  trx = null
}) {
  try {
    log(`Writing ${entity_type} entity to database`)

    // Validate required parameters
    validate_entity_params({
      entity_properties,
      entity_type,
      user_id,
      absolute_path,
      base_relative_path,
      git_sha
    })

    const db_client = trx || db
    const entity_id = entity_properties.entity_id

    // Prepare entity data for database operations
    const entity_data = prepare_entity_data({
      entity_properties,
      entity_type,
      user_id,
      entity_content,
      absolute_path,
      base_relative_path,
      git_sha
    })

    // Create or update the entity
    await create_or_update_entity({
      entity_data,
      entity_id,
      db_client
    })

    // Process relations if present
    await process_entity_relations({
      entity_id,
      formatted_entity_metadata,
      user_id,
      db_client
    })

    // Process tags if present
    if (entity_properties.tags) {
      await process_entity_tags({
        entity_id,
        tags: entity_properties.tags,
        db_client
      })
    }

    // Handle archived status if present
    await update_entity_archive_status({
      entity_id,
      archived_at: entity_properties.archived_at,
      db_client
    })

    return entity_id
  } catch (error) {
    log('Error writing entity to database:', error)
    throw error
  }
}

export default write_entity_to_database
