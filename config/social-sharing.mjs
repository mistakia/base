/**
 * Social sharing configuration for Open Graph and Twitter Card meta tags
 */
import config from './index.mjs'

export const social_sharing = {
  // Default meta tag values
  site_name: 'Base',
  default_title: 'Base - Human-in-the-Loop System',
  default_description: 'Agentic knowledge base management and execution system',

  // Twitter Card settings
  twitter_card_type: 'summary_large_image',

  // Social sharing image path
  default_image: '/static/link-image.png',

  // Meta tag defaults for different content types
  content_types: {
    thread: {
      og_type: 'article',
      default_title: 'Thread - Base',
      default_description: 'Execution thread from Base system'
    },
    entity: {
      og_type: 'article',
      default_title: 'Entity - Base',
      default_description: 'Entity from Base system'
    },
    // Specific entity types
    task: {
      og_type: 'article',
      default_title: 'Task - Base',
      default_description: 'Task entity from Base system'
    },
    text: {
      og_type: 'article',
      default_title: 'Document - Base',
      default_description: 'Text document from Base system'
    },
    workflow: {
      og_type: 'article',
      default_title: 'Workflow - Base',
      default_description: 'Workflow definition from Base system'
    },
    guideline: {
      og_type: 'article',
      default_title: 'Guideline - Base',
      default_description: 'Guideline from Base system'
    },
    tag: {
      og_type: 'article',
      default_title: 'Tag - Base',
      default_description: 'Tag definition from Base system'
    },
    'physical-item': {
      og_type: 'article',
      default_title: 'Physical Item - Base',
      default_description: 'Physical item record from Base system'
    },
    'physical-location': {
      og_type: 'article',
      default_title: 'Location - Base',
      default_description: 'Physical location record from Base system'
    },
    'change-request': {
      og_type: 'article',
      default_title: 'Change Request - Base',
      default_description: 'Change request from Base system'
    },
    activity: {
      og_type: 'article',
      default_title: 'Activity - Base',
      default_description: 'Activity record from Base system'
    },
    directory: {
      og_type: 'website',
      default_title: 'Directory - Base',
      default_description: 'Entity directory from Base system'
    },
    home: {
      og_type: 'website',
      default_title: 'Base - Human-in-the-Loop System',
      default_description:
        'Agentic knowledge base management and execution system'
    },
    page: {
      og_type: 'website',
      default_title: 'Page - Base',
      default_description: 'Page from Base system'
    }
  },

  // Privacy settings
  redacted_content: {
    title: 'Private Content - Base',
    description: 'This content is private and not available for public viewing'
  },

  // Entity privacy and redaction rules
  privacy_rules: {
    // Default behavior for entities without public_read
    default_entity_behavior: 'redact',

    // Entity types that should always be redacted regardless of public_read
    always_private_types: [],

    // Entity types that are public by default (rare, most should be explicit)
    public_by_default_types: [],

    // Content redaction settings
    content_redaction: {
      replace_title: true,
      replace_description: true,
      preserve_type: true, // Keep entity type visible in meta tags
      generic_message: 'Private content from Base system'
    }
  }
}

/**
 * Get absolute URL for social sharing images
 * @param {string} image_path - Relative image path
 * @returns {string} Absolute image URL
 */
export function get_social_image_url(image_path) {
  if (!config.production_url) {
    throw new Error(
      'config.production_url is required for generating absolute social sharing image URLs'
    )
  }

  // Handle both relative paths and full paths
  const clean_path = image_path.startsWith('/') ? image_path : `/${image_path}`
  return `${config.production_url}${clean_path}`
}

/**
 * Get social sharing configuration for a content type
 * @param {string} content_type - Type of content (thread, entity, home, page)
 * @returns {Object} Social sharing config for the content type
 */
export function get_content_type_config(content_type) {
  return (
    social_sharing.content_types[content_type] ||
    social_sharing.content_types.entity ||
    social_sharing.content_types.page
  )
}

/**
 * Get social sharing image URL for an entity type
 * @param {string} entity_type - Entity type (task, text, workflow, etc.)
 * @returns {string} Absolute image URL for the entity type
 */
export function get_entity_social_image_url(entity_type) {
  const type_config = get_content_type_config(entity_type)
  const image_path = type_config.social_image || social_sharing.default_image
  return get_social_image_url(image_path)
}

/**
 * Check if entity type should be redacted based on privacy rules
 * @param {string} entity_type - Entity type to check
 * @param {boolean} has_public_read - Whether entity has public_read enabled
 * @returns {boolean} True if content should be redacted
 */
export function should_redact_entity(entity_type, has_public_read = false) {
  const privacy_rules = social_sharing.privacy_rules

  // Always redact types that are configured as always private
  if (privacy_rules.always_private_types.includes(entity_type)) {
    return true
  }

  // Public by default types are not redacted unless explicitly private
  if (privacy_rules.public_by_default_types.includes(entity_type)) {
    return false
  }

  // Default behavior: redact if no public_read permission
  return !has_public_read
}

export default social_sharing
