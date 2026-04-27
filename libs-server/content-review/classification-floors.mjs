import debug from 'debug'

const log = debug('content-review:floors')

const TIER_PRIORITY = { public: 1, acquaintance: 2, private: 3 }

function most_restrictive(a, b) {
  const pa = TIER_PRIORITY[a] || 0
  const pb = TIER_PRIORITY[b] || 0
  return pb > pa ? b : a
}

/**
 * Enforce minimum classification when curated regex categories match.
 * Mutates result in place; floors `personal_names`, `personal_property`,
 * and `personal_locations` matches to private regardless of LLM verdict.
 */
export function apply_regex_floor(result, regex_findings) {
  if (!regex_findings || regex_findings.length === 0) {
    return result
  }

  const has_personal_names = regex_findings.some(
    (f) => f.category === 'personal_names'
  )
  const has_personal_property = regex_findings.some(
    (f) => f.category === 'personal_property'
  )
  const has_personal_locations = regex_findings.some(
    (f) => f.category === 'personal_locations'
  )

  if (
    (has_personal_property || has_personal_names || has_personal_locations) &&
    result.classification !== 'private'
  ) {
    const original = result.classification
    const trigger_category = has_personal_property
      ? 'personal_property'
      : has_personal_locations
        ? 'personal_locations'
        : 'personal_names'
    result.classification = 'private'
    result.reasoning = `${result.reasoning} [Regex floor: ${original} overridden to private due to curated ${trigger_category} pattern match]`
    result.regex_floor_applied = true
    log(`Regex floor applied: ${original} -> private (${trigger_category})`)
  }

  return result
}

/**
 * Enforce minimum classification when the privacy-filter token classifier
 * returned spans whose labels map to a non-public floor.
 *
 * @param {object} result - Analysis result, mutated in place
 * @param {object|null} filter_result - { labels_found: string[] } or null
 * @param {object} privacy_filter_config - Slice of review_config.privacy_filter
 * @returns {object} The mutated result
 */
export function apply_filter_floor(result, filter_result, privacy_filter_config) {
  if (!filter_result || !Array.isArray(filter_result.labels_found)) {
    return result
  }
  const labels_found = filter_result.labels_found
  if (labels_found.length === 0) {
    return result
  }

  const label_floor = (privacy_filter_config && privacy_filter_config.label_floor) || {}

  let floor = 'public'
  let trigger_label = null
  for (const label of labels_found) {
    const label_tier = label_floor[label]
    if (!label_tier) continue
    const next = most_restrictive(floor, label_tier)
    if (next !== floor) {
      floor = next
      trigger_label = label
    }
  }

  if (floor === 'public' || !trigger_label) {
    return result
  }

  const original = result.classification
  const new_classification = most_restrictive(original, floor)
  if (new_classification !== original) {
    result.classification = new_classification
    result.reasoning = `${result.reasoning || ''} [Filter floor: ${original} overridden to ${new_classification} due to privacy-filter label ${trigger_label}]`.trim()
    result.filter_floor_applied = true
    log(
      `Filter floor applied: ${original} -> ${new_classification} (${trigger_label})`
    )
  }

  return result
}
