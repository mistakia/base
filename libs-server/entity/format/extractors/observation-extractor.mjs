/**
 * Extract observations from entity properties
 * @param {Object} options - Function options
 * @param {Object} options.entity_properties - The entity properties
 * @returns {Array} Extracted entity observations
 */
export function extract_entity_observations({ entity_properties }) {
  const observations = []

  // Extract observations from entity properties
  if (
    entity_properties.observations &&
    Array.isArray(entity_properties.observations)
  ) {
    entity_properties.observations.forEach((observation_str) => {
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
