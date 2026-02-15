import fs from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('github-entity-mapper')
const GITHUB_ENTITY_MAPPINGS_PATH = path.resolve(
  config.user_base_directory,
  'task/github/github-entity-mappings.json'
)

/**
 * Load the GitHub entity mappings configuration
 *
 * @returns {Object} The mappings configuration
 */
export function load_mappings() {
  try {
    const config_content = fs.readFileSync(GITHUB_ENTITY_MAPPINGS_PATH, 'utf8')
    return JSON.parse(config_content).mappings
  } catch (error) {
    log(`Error loading mappings: ${error.message}`)
    return {
      entities: {}
    }
  }
}

/**
 * Map a GitHub label to entity tags (many-to-many)
 *
 * @param {string} label - The GitHub label
 * @returns {Array} Array of entity tags (full paths)
 */
export function label_to_tags(label) {
  if (!label) return []
  const mappings = load_mappings()
  return mappings.labels_to_tags[label] || []
}

/**
 * Map an entity tag to GitHub labels (many-to-many)
 *
 * @param {string} tag - The entity tag (full path)
 * @returns {Array} Array of GitHub labels
 */
export function tag_to_labels(tag) {
  if (!tag) return []
  const mappings = load_mappings()
  return mappings.tags_to_labels[tag] || []
}

/**
 * Extract tags from GitHub labels (many-to-many)
 *
 * @param {Array} labels - Array of GitHub label objects with name property
 * @returns {Array} Array of entity tags (full paths)
 */
export function extract_tags_from_labels(labels) {
  if (!labels || !Array.isArray(labels)) return []
  const tags = new Set()
  for (const label of labels) {
    if (label.name) {
      for (const tag of label_to_tags(label.name)) {
        tags.add(tag)
      }
    }
  }
  return Array.from(tags)
}
