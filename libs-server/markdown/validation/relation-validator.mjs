import { entity_exists } from '#libs-server/entities/index.mjs'

/**
 * Validate that all relation targets exist
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {string} [params.user_branch] - Optional git branch to check user relations in
 * @param {string} [params.system_branch] - Optional git branch to check system relations in
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_relations_exist({
  formatted_markdown_entity,
  user_branch,
  system_branch
}) {
  if (
    !formatted_markdown_entity ||
    typeof formatted_markdown_entity !== 'object'
  ) {
    throw new Error('formatted_markdown_entity must be an object')
  }

  const relations =
    (formatted_markdown_entity.entity_metadata &&
      formatted_markdown_entity.entity_metadata.relations) ||
    []
  if (relations.length === 0) return { valid: true }

  const validation_results = await Promise.all(
    relations.map(async (relation) => {
      const exists = await entity_exists({
        entity_path: `${relation.entity_path}.md`,
        user_branch,
        system_branch
      })
      return { entity_path: relation.entity_path, exists }
    })
  )

  const missing_targets = validation_results
    .filter((result) => !result.exists)
    .map((result) => result.entity_path)

  if (missing_targets.length > 0) {
    return {
      valid: false,
      errors: missing_targets.map(
        (entity_path) => `Relation target entity not found: ${entity_path}`
      )
    }
  }

  return { valid: true }
}
