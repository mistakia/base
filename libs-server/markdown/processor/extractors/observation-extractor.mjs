/**
 * Extract observations from frontmatter
 * @param {Object} parsed_markdown Parsed markdown entity
 * @returns {Array} Extracted entity observations
 */
export function extract_entity_observations(parsed_markdown) {
  const observations = []
  const frontmatter = parsed_markdown.frontmatter || {}

  // Extract observations from frontmatter
  if (frontmatter.observations && Array.isArray(frontmatter.observations)) {
    frontmatter.observations.forEach((observation_str) => {
      // Parse observation string in format: "[category] content #tag (optional context)"
      const observation_match = observation_str.match(
        /^\[(.*?)\] (.*?)( \((.*?)\))?$/
      )

      if (observation_match) {
        observations.push({
          category: observation_match[1],
          content: observation_match[2],
          context: observation_match[4] || null
        })
      }
    })
  }

  return observations
}
