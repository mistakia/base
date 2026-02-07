import debug from 'debug'
import { find_duplicate_tags } from './find-duplicate-tags.mjs'

/**
 * Factory function to create validation functions with pluggable existence checking backends.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.debug_namespace - Debug namespace prefix (e.g., 'entity:filesystem' or 'entity:git')
 * @param {Function} options.check_tag_exists - Async function to check if a tag exists
 *   For filesystem: ({ base_uri }) => Promise<boolean>
 *   For git: ({ base_uri, branch }) => Promise<{ success, exists }>
 * @param {Function} options.check_entity_exists - Async function to check if an entity exists
 *   For filesystem: ({ base_uri }) => Promise<boolean>
 *   For git: ({ base_uri, branch }) => Promise<{ success, exists }>
 * @param {Function} options.normalize_exists_result - Function to normalize existence result to boolean
 * @returns {Object} Object containing validation functions
 */
export function create_validator({
  debug_namespace,
  check_tag_exists,
  check_entity_exists,
  normalize_exists_result = (result) => result
}) {
  const tags_log = debug(`${debug_namespace}:validate:tags`)
  const relations_log = debug(`${debug_namespace}:validate:relations`)
  const references_log = debug(`${debug_namespace}:validate:references`)

  /**
   * Validate that tags exist
   *
   * @param {Object} params - Parameters
   * @param {Array} params.property_tags - Array of tag objects from properties
   * @param {Object} [params.context] - Additional context (e.g., { branch } for git)
   * @returns {Promise<Object>} - Validation result {valid, errors?}
   */
  async function validate_tags({ property_tags = [], ...context }) {
    if (!Array.isArray(property_tags)) {
      return {
        valid: false,
        errors: ['property_tags must be an array']
      }
    }

    try {
      if (property_tags.length === 0) {
        return { valid: true }
      }

      tags_log(`Validating ${property_tags.length} tags`)

      // Check for duplicate tags
      const duplicate_tags = find_duplicate_tags({ tags: property_tags })
      if (duplicate_tags.length > 0) {
        return {
          valid: false,
          errors: duplicate_tags.map((uri) => `duplicate tag: ${uri}`)
        }
      }

      const all_tags = [
        ...property_tags.map((tag) => ({ ...tag, source: 'property' }))
      ]

      const tag_validation_promises = all_tags.map(async (tag) => {
        const result = await check_tag_exists({
          base_uri: tag.base_uri,
          ...context
        })
        return {
          base_uri: tag.base_uri,
          exists: normalize_exists_result(result),
          source: tag.source
        }
      })

      const tag_results = await Promise.all(tag_validation_promises)
      const missing_tags = tag_results.filter((result) => !result.exists)

      if (missing_tags.length === 0) {
        tags_log('All tags validated successfully')
        return { valid: true }
      }

      return {
        valid: false,
        errors: missing_tags.map(
          (tag) => `${tag.source} tag not found: ${tag.base_uri}`
        )
      }
    } catch (error) {
      tags_log('Error validating tags:', error)
      return {
        valid: false,
        errors: [`Tag validation error: ${error.message}`]
      }
    }
  }

  /**
   * Validate that relations exist
   *
   * @param {Object} params - Parameters
   * @param {Array} params.relations - Array of relation objects
   * @param {Object} [params.context] - Additional context (e.g., { branch } for git)
   * @returns {Promise<Object>} - Validation result {valid, errors?}
   */
  async function validate_relations({ relations = [], ...context }) {
    if (!Array.isArray(relations)) {
      return {
        valid: false,
        errors: ['Relations must be an array']
      }
    }

    try {
      if (relations.length === 0) {
        return { valid: true }
      }

      relations_log(`Validating ${relations.length} relations`)

      const validation_promises = relations.map(async (relation) => {
        const result = await check_entity_exists({
          base_uri: relation.base_uri,
          ...context
        })

        return {
          base_uri: relation.base_uri,
          exists: normalize_exists_result(result)
        }
      })

      const results = await Promise.all(validation_promises)
      const missing_relations = results.filter((result) => !result.exists)

      if (missing_relations.length === 0) {
        relations_log('All relations validated successfully')
        return { valid: true }
      }

      return {
        valid: false,
        errors: missing_relations.map(
          (rel) => `Relation target entity not found: ${rel.base_uri}`
        )
      }
    } catch (error) {
      relations_log('Error validating relations:', error)
      return {
        valid: false,
        errors: [`Relation validation error: ${error.message}`]
      }
    }
  }

  /**
   * Validate that references exist
   *
   * @param {Object} params - Parameters
   * @param {Array} params.references - Array of reference objects
   * @param {Object} [params.context] - Additional context (e.g., { branch } for git)
   * @returns {Promise<Object>} - Validation result {valid, errors?}
   */
  async function validate_references({ references = [], ...context }) {
    if (!Array.isArray(references)) {
      return {
        valid: false,
        errors: ['References must be an array']
      }
    }

    try {
      if (references.length === 0) {
        return { valid: true }
      }

      const reference_base_uris = references.map((ref) => ref.base_uri)
      references_log(`Validating ${reference_base_uris.length} references`)

      const validation_promises = reference_base_uris.map(
        async (reference_base_uri) => {
          const result = await check_entity_exists({
            base_uri: reference_base_uri,
            ...context
          })

          return {
            reference_base_uri,
            exists: normalize_exists_result(result)
          }
        }
      )

      const reference_results = await Promise.all(validation_promises)
      const missing_references = reference_results.filter(
        (result) => !result.exists
      )

      if (missing_references.length === 0) {
        references_log('All references validated successfully')
        return { valid: true }
      }

      return {
        valid: false,
        errors: missing_references.map(
          (ref) => `Reference not found: ${ref.reference_base_uri}`
        )
      }
    } catch (error) {
      references_log('Error validating references:', error)
      return {
        valid: false,
        errors: [`Reference validation error: ${error.message}`]
      }
    }
  }

  return {
    validate_tags,
    validate_relations,
    validate_references
  }
}
