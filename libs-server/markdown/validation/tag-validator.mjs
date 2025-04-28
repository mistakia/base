import { tag_exists } from '#libs-server/tags/index.mjs'

/**
 * Validate that all tags exist
 *
 * @param {Object} params - Parameters
 * @param {Object} params.formatted_markdown_entity - Formatted markdown data
 * @param {string} [params.system_branch] - Optional git branch to check system tags in
 * @param {string} [params.user_branch] - Optional git branch to check user tags in
 * @returns {Promise<Object>} - Validation result {valid, errors?}
 */
export async function validate_tags_exist({
  formatted_markdown_entity,
  system_branch,
  user_branch
}) {
  if (
    !formatted_markdown_entity ||
    typeof formatted_markdown_entity !== 'object'
  ) {
    throw new Error('formatted_markdown_entity must be an object')
  }

  const tags =
    (formatted_markdown_entity.entity_metadata &&
      formatted_markdown_entity.entity_metadata.tags) ||
    []
  if (tags.length === 0) return { valid: true }

  const validation_results = await Promise.all(
    tags.map(async (tag) => {
      const exists = await tag_exists({
        tag_id: tag.tag_id,
        system_branch,
        user_branch
      })
      return { tag_id: tag.tag_id, exists }
    })
  )

  const missing_tags = validation_results
    .filter((result) => !result.exists)
    .map((result) => result.tag_id)

  if (missing_tags.length > 0) {
    return {
      valid: false,
      errors: missing_tags.map((tag_id) => `Tag entity not found: ${tag_id}`)
    }
  }

  return { valid: true }
}
