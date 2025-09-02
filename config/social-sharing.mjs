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
    title: 'Private Thread - Base',
    description: 'This thread contains private content'
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
    social_sharing.content_types.page
  )
}

export default social_sharing
