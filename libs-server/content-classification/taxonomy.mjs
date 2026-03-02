import fs from 'fs'

/**
 * Load and validate taxonomy configuration, merging per-source examples
 * from the unified config into the domain entries.
 *
 * @param {string} config_path - Absolute path to unified config JSON
 * @param {string} source_id - Source identifier (twitter, reddit, github)
 * @returns {object} Resolved taxonomy with domains, tag_hierarchy, social_media_domains
 */
export function load_taxonomy(config_path, source_id) {
  if (!fs.existsSync(config_path)) {
    throw new Error(`Taxonomy config not found: ${config_path}`)
  }

  const raw = fs.readFileSync(config_path, 'utf-8')
  const config = JSON.parse(raw)

  if (!Array.isArray(config.domains) || config.domains.length === 0) {
    throw new Error('Taxonomy must have a non-empty "domains" array')
  }

  for (const domain of config.domains) {
    if (!domain.tag || !domain.label || !domain.description) {
      throw new Error(
        `Each domain must have tag, label, and description. Invalid: ${JSON.stringify(domain)}`
      )
    }
  }

  const source_config = config.sources?.[source_id]
  if (!source_config) {
    throw new Error(`No source config found for "${source_id}" in taxonomy`)
  }

  // Merge per-source examples into domain entries, filter by exclude_tags
  const exclude_tags = new Set(source_config.exclude_tags || [])
  const source_examples = source_config.examples || {}

  const domains = config.domains
    .filter((d) => !exclude_tags.has(d.tag))
    .map((d) => ({
      ...d,
      examples: source_examples[d.tag] || d.examples || []
    }))

  const social_media_domains = source_config.social_media_domains || []
  if (!Array.isArray(social_media_domains)) {
    throw new Error(
      `sources.${source_id}.social_media_domains must be an array`
    )
  }

  return {
    domains,
    tag_hierarchy: config.tag_hierarchy || {},
    social_media_domains
  }
}

/**
 * Format domain descriptions for use in classification prompts.
 * Produces the markdown block listing each domain with examples.
 *
 * @param {object} taxonomy - Resolved taxonomy from load_taxonomy
 * @returns {string} Formatted domain descriptions
 */
export function format_domain_descriptions(taxonomy) {
  return taxonomy.domains
    .map((d) => {
      const examples = d.examples.map((e) => `    - "${e}"`).join('\n')
      return `- **${d.tag}** (${d.label}): ${d.description}\n  Examples:\n${examples}`
    })
    .join('\n\n')
}
