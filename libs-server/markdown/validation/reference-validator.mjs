import { entity_exists } from '#libs-server/entities/index.mjs'

/**
 * Validate that all references in the markdown exist
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {string} [params.user_branch] - Optional git branch to check user references in
 * @param {string} [params.system_branch] - Optional git branch to check system references in
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_references_exist({
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

  const references = (
    formatted_markdown_entity.entity_metadata?.references || []
  ).map((ref) => ref.reference_path)

  if (references.length === 0) return { valid: true }

  const validation_results = await Promise.all(
    references.map(async (reference_path) => {
      const exists = await entity_exists({
        entity_path: reference_path,
        user_branch,
        system_branch
      })
      return { reference_path, exists }
    })
  )

  const missing_references = validation_results
    .filter((result) => !result.exists)
    .map((result) => result.reference_path)

  if (missing_references.length > 0) {
    return {
      valid: false,
      errors: missing_references.map(
        (reference_path) => `Reference not found: ${reference_path}`
      )
    }
  }

  return { valid: true }
}
