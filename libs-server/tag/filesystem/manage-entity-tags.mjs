import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

const log = debug('manage-entity-tags')

/**
 * Add tags to an entity using existing entity read/write functions
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to the entity file
 * @param {string[]} options.tags_to_add - Array of base-uri formatted tags to add
 * @returns {Promise<Object>} Operation result with status information
 */
export const add_tags_to_entity = async ({ absolute_path, tags_to_add }) => {
  try {
    log('Adding tags to entity', { absolute_path, tags_to_add })

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    if (
      !tags_to_add ||
      !Array.isArray(tags_to_add) ||
      tags_to_add.length === 0
    ) {
      throw new Error('Tags to add must be a non-empty array')
    }

    // Read current entity using existing function
    const read_result = await read_entity_from_filesystem({ absolute_path })

    if (!read_result.success) {
      return {
        success: false,
        error: `Failed to read entity: ${read_result.error}`,
        absolute_path
      }
    }

    const { entity_properties, entity_content } = read_result
    const entity_type = entity_properties.type

    // Get current tags or initialize empty array
    const current_tags = entity_properties.tags || []

    // Deduplicate input tags first, then filter out those already present
    const deduplicated_input = [...new Set(tags_to_add)]
    const unique_new_tags = deduplicated_input.filter(
      (tag) => !current_tags.includes(tag)
    )

    if (unique_new_tags.length === 0) {
      log('No new tags to add - all tags already exist')
      return {
        success: true,
        added_tags: [],
        skipped_tags: deduplicated_input,
        total_tags: current_tags.length,
        absolute_path
      }
    }

    const updated_tags = [...current_tags, ...unique_new_tags]

    // Update entity properties with new tags
    const updated_properties = {
      ...entity_properties,
      tags: updated_tags
    }

    // Write updated entity using existing function
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_properties,
      entity_type,
      entity_content
    })

    log('Successfully added tags to entity', {
      absolute_path,
      added_tags: unique_new_tags,
      skipped_tags: deduplicated_input.filter((tag) =>
        current_tags.includes(tag)
      )
    })

    return {
      success: true,
      added_tags: unique_new_tags,
      skipped_tags: deduplicated_input.filter((tag) =>
        current_tags.includes(tag)
      ),
      total_tags: updated_tags.length,
      absolute_path
    }
  } catch (error) {
    log('Error adding tags to entity:', error)
    return {
      success: false,
      error: error.message,
      absolute_path
    }
  }
}

/**
 * Remove tags from an entity using existing entity read/write functions
 *
 * @param {Object} options - Function options
 * @param {string} options.absolute_path - The absolute path to the entity file
 * @param {string[]} options.tags_to_remove - Array of base-uri formatted tags to remove
 * @returns {Promise<Object>} Operation result with status information
 */
export const remove_tags_from_entity = async ({
  absolute_path,
  tags_to_remove
}) => {
  try {
    log('Removing tags from entity', { absolute_path, tags_to_remove })

    if (!absolute_path) {
      throw new Error('Absolute path is required')
    }

    if (
      !tags_to_remove ||
      !Array.isArray(tags_to_remove) ||
      tags_to_remove.length === 0
    ) {
      throw new Error('Tags to remove must be a non-empty array')
    }

    // Read current entity using existing function
    const read_result = await read_entity_from_filesystem({ absolute_path })

    if (!read_result.success) {
      return {
        success: false,
        error: `Failed to read entity: ${read_result.error}`,
        absolute_path
      }
    }

    const { entity_properties, entity_content } = read_result
    const entity_type = entity_properties.type

    // Get current tags or empty array
    const current_tags = entity_properties.tags || []

    // Deduplicate input tags first
    const deduplicated_input = [...new Set(tags_to_remove)]

    // Filter to find which tags can actually be removed
    const tags_actually_removed = deduplicated_input.filter((tag) =>
      current_tags.includes(tag)
    )

    if (tags_actually_removed.length === 0) {
      log('No tags to remove - none of the specified tags exist')
      return {
        success: true,
        removed_tags: [],
        not_found_tags: deduplicated_input,
        total_tags: current_tags.length,
        absolute_path
      }
    }

    const updated_tags = current_tags.filter(
      (tag) => !deduplicated_input.includes(tag)
    )

    // Update entity properties with filtered tags
    const updated_properties = {
      ...entity_properties,
      tags: updated_tags
    }

    // Write updated entity using existing function
    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: updated_properties,
      entity_type,
      entity_content
    })

    log('Successfully removed tags from entity', {
      absolute_path,
      removed_tags: tags_actually_removed,
      not_found_tags: deduplicated_input.filter(
        (tag) => !current_tags.includes(tag)
      )
    })

    return {
      success: true,
      removed_tags: tags_actually_removed,
      not_found_tags: deduplicated_input.filter(
        (tag) => !current_tags.includes(tag)
      ),
      total_tags: updated_tags.length,
      absolute_path
    }
  } catch (error) {
    log('Error removing tags from entity:', error)
    return {
      success: false,
      error: error.message,
      absolute_path
    }
  }
}
