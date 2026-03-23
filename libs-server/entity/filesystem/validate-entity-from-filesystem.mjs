import debug from 'debug'
import { validate_entity_properties } from '../validate-schema.mjs'
import { validate_constraints } from '../validation/validate-constraints.mjs'
import { validate_relation_cardinality } from '../validation/validate-relation-cardinality.mjs'
import { validate_relative_path_links } from '../validation/validate-relative-path-links.mjs'
import { validate_tags_from_filesystem } from './validate-tags-from-filesystem.mjs'
import { validate_relations_from_filesystem } from './validate-relations-from-filesystem.mjs'
import { validate_references_from_filesystem } from './validate-references-from-filesystem.mjs'

const log = debug('entity:filesystem:validate')

/**
 * Validate entity from filesystem against schema
 *
 * @param {Object} params - Parameters
 * @param {Object} params.entity_properties - Entity properties for schema validation
 * @param {Object} [params.formatted_entity_metadata] - Entity metadata for validation
 * @param {Object} [params.schemas] - Schema definitions map
 * @param {string} [params.entity_content] - Raw markdown body content for content-level checks
 * @returns {Promise<Object>} - Validation result {success, errors?}
 */
export async function validate_entity_from_filesystem({
  entity_properties,
  formatted_entity_metadata = {},
  schemas,
  entity_content
}) {
  // Validate required parameters
  if (!entity_properties || typeof entity_properties !== 'object') {
    return {
      success: false,
      error: 'Invalid entity properties'
    }
  }

  if (
    !formatted_entity_metadata ||
    typeof formatted_entity_metadata !== 'object'
  ) {
    log(
      'Warning: No formatted_entity_metadata provided, some validations may be skipped'
    )
  }

  try {
    log(`Validating entity from filesystem: ${entity_properties.entity_id}`)

    // Validate that relations property is not empty - if present, it must have values
    // Empty arrays or null/undefined values for relations should be omitted entirely
    if (Object.prototype.hasOwnProperty.call(entity_properties, 'relations')) {
      const relations = entity_properties.relations
      if (
        relations === null ||
        relations === undefined ||
        (Array.isArray(relations) && relations.length === 0)
      ) {
        return {
          success: false,
          errors: [
            'Empty relations property is not allowed. If there are no relations, omit the relations property entirely.'
          ],
          warnings: []
        }
      }

      // Detect double-prefixed relation strings where the YAML list marker
      // "- " was included in the string value (e.g. "- relates [[...]]")
      if (Array.isArray(relations)) {
        const double_prefixed = relations.filter(
          (rel) => typeof rel === 'string' && rel.startsWith('- ')
        )
        if (double_prefixed.length > 0) {
          return {
            success: false,
            errors: double_prefixed.map(
              (rel) =>
                `Relation has double-prefixed YAML list marker: "${rel}". Remove the leading "- " from the relation string.`
            ),
            warnings: []
          }
        }
      }
    }

    // Run schema validation if schemas are provided
    const schema_result = schemas
      ? await validate_entity_properties({
          entity_properties,
          entity_type: entity_properties.type,
          schemas
        })
      : { valid: true }

    // Skip further validations if schema validation failed
    if (!schema_result.valid) {
      return {
        success: schema_result.valid,
        errors: schema_result.errors || [],
        warnings: []
      }
    }

    // Run remaining validations in parallel
    const [tags_result, relations_result, references_result] =
      await Promise.all([
        // Validate tags existence in filesystem
        validate_tags_from_filesystem({
          ...formatted_entity_metadata
        }),

        // Validate relations existence in filesystem
        validate_relations_from_filesystem({
          ...formatted_entity_metadata
        }),

        // Validate references existence in filesystem
        validate_references_from_filesystem({
          ...formatted_entity_metadata
        })
      ])

    // Combine all validation errors
    const all_errors = [
      ...(schema_result.errors || []),
      ...(tags_result.errors || []),
      ...(relations_result.errors || []),
      ...(references_result.errors || [])
    ].map(String)

    // Run warning-level validators (constraints, relation cardinality)
    const constraint_params = {
      entity_properties,
      entity_type: entity_properties.type,
      schemas
    }
    const constraints_result = validate_constraints(constraint_params)
    const cardinality_result = validate_relation_cardinality(constraint_params)

    // Relative path links are errors (entity content must use base-uri or wikilinks)
    const relative_path_result = validate_relative_path_links({
      entity_content
    })
    all_errors.push(...(relative_path_result.errors || []).map(String))

    const all_warnings = [
      ...constraints_result.warnings,
      ...cardinality_result.warnings
    ]

    if (all_errors.length > 0) {
      return {
        success: false,
        errors: all_errors,
        warnings: all_warnings
      }
    }

    log('Entity validation successful')
    return {
      success: true,
      warnings: all_warnings
    }
  } catch (error) {
    log('Error validating entity from filesystem:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export default validate_entity_from_filesystem
