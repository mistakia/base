import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  social_sharing,
  get_social_image_url,
  get_content_type_config
} from '#config/social-sharing.mjs'
import { resolve_entity_from_path } from './entity-resolver.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_json_file_or_default } from '#libs-server/threads/thread-utils.mjs'
import { check_thread_permission } from '#server/middleware/permission/index.mjs'

const log = debug('server:meta-extractor')

/**
 * Sanitize a string for use in HTML meta tag content attributes.
 * Strips HTML tags and markdown syntax, escapes HTML entities,
 * and truncates to a reasonable length for meta descriptions.
 *
 * @param {string} text - Raw text that may contain HTML or markdown
 * @param {number} [max_length=200] - Maximum character length
 * @returns {string} Sanitized plain text safe for HTML attributes
 */
function sanitize_meta_text(text, max_length = 200) {
  if (!text || typeof text !== 'string') return ''

  let sanitized = text
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip markdown image syntax ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Strip markdown links [text](url) -> text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Strip wiki links [[text]] -> text
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()

  // Truncate with ellipsis
  if (sanitized.length > max_length) {
    sanitized = sanitized.substring(0, max_length - 3).trimEnd() + '...'
  }

  // Escape HTML entities for safe attribute insertion
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return sanitized
}

/**
 * Extract meta tag data from content (thread or entity) with privacy handling
 *
 * @param {Object} params - Parameters object
 * @param {string} [params.thread_id] - Thread ID to extract meta data for
 * @param {string} [params.entity_path] - Entity file path to extract meta data for
 * @param {string} [params.user_public_key] - User public key for permission checking
 * @param {string} params.base_url - Base URL for generating absolute URLs
 * @returns {Promise<Object>} Meta tag data object for template replacement
 */
export async function extract_meta_data({
  thread_id,
  entity_path,
  user_public_key = null,
  base_url
}) {
  // Route to appropriate handler
  if (entity_path) {
    return extract_entity_meta_data({ entity_path, user_public_key, base_url })
  } else if (thread_id) {
    return extract_thread_meta_data({ thread_id, user_public_key, base_url })
  }

  // Default fallback
  return get_default_meta_data(base_url)
}

/**
 * Extract meta tag data from entity content with privacy handling
 *
 * @param {Object} params - Parameters object
 * @param {string} params.entity_path - Entity file path to extract meta data for
 * @param {string} [params.user_public_key] - User public key for permission checking
 * @param {string} params.base_url - Base URL for generating absolute URLs
 * @returns {Promise<Object>} Meta tag data object for template replacement
 */
export async function extract_entity_meta_data({
  entity_path,
  user_public_key = null,
  base_url
}) {
  try {
    log(`Extracting meta data for entity ${entity_path}`)

    // Get entity metadata with permission checking
    const entity_metadata = await resolve_entity_from_path({
      file_path: entity_path,
      user_public_key: user_public_key || config.user_public_key
    })

    if (!entity_metadata.exists) {
      log(`Entity ${entity_path} not found, using fallback meta`)
      return get_default_meta_data(base_url, entity_path)
    }

    // Check if content is redacted/private
    const is_redacted = entity_metadata.is_redacted || false

    if (is_redacted) {
      log(`Entity ${entity_path} is redacted, using generic meta tags`)
      return get_redacted_meta_data(base_url, entity_path)
    }

    // Extract entity information for meta tags — sanitize for HTML attribute safety
    const title = sanitize_meta_text(
      entity_metadata.title || `${entity_metadata.type} Entity`,
      120
    )
    const raw_description =
      entity_metadata.description || `${entity_metadata.type} from Base system`
    const description = sanitize_meta_text(raw_description)

    // Format creation date if available
    let author_info = 'Base System'
    if (entity_metadata.created_at) {
      const created_date = new Date(entity_metadata.created_at)
      author_info = `Base System - ${created_date.toLocaleDateString()}`
    }

    // Get content type config for entity
    const content_type = entity_metadata.type || 'entity'
    const type_config = get_content_type_config(content_type)

    // Generate entity-specific meta tags using default social image
    const entity_meta = {
      PAGE_TITLE: `${title} - ${social_sharing.site_name}`,
      OG_TITLE: title,
      OG_DESCRIPTION: description,
      OG_IMAGE: get_social_image_url(social_sharing.default_image),
      OG_URL: `${base_url}/${entity_path}`,
      OG_TYPE: type_config.og_type,
      SITE_NAME: social_sharing.site_name,
      TWITTER_CARD: social_sharing.twitter_card_type,
      TWITTER_TITLE: title,
      TWITTER_DESCRIPTION: description,
      TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
      META_DESCRIPTION: description,
      META_AUTHOR: author_info
    }

    log(`Meta data extracted successfully for entity ${entity_path}`)
    return entity_meta
  } catch (error) {
    log(
      `Error extracting meta data for entity ${entity_path}: ${error.message}`
    )
    return get_default_meta_data(base_url, entity_path)
  }
}

/**
 * Extract meta tag data from thread content with privacy handling
 *
 * @param {Object} params - Parameters object
 * @param {string} params.thread_id - Thread ID to extract meta data for
 * @param {string} [params.user_public_key] - User public key for permission checking
 * @param {string} params.base_url - Base URL for generating absolute URLs
 * @returns {Promise<Object>} Meta tag data object for template replacement
 */
export async function extract_thread_meta_data({
  thread_id,
  user_public_key = null,
  base_url
}) {
  // Get content type config
  const content_type = thread_id ? 'thread' : 'home'
  const type_config = get_content_type_config(content_type)

  // Default meta values for fallback using configuration
  const default_meta = {
    PAGE_TITLE: social_sharing.default_title,
    OG_TITLE: social_sharing.default_title,
    OG_DESCRIPTION: social_sharing.default_description,
    OG_IMAGE: get_social_image_url(social_sharing.default_image),
    OG_URL: base_url,
    OG_TYPE: type_config.og_type,
    SITE_NAME: social_sharing.site_name,
    TWITTER_CARD: social_sharing.twitter_card_type,
    TWITTER_TITLE: social_sharing.default_title,
    TWITTER_DESCRIPTION: social_sharing.default_description,
    TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
    META_DESCRIPTION: social_sharing.default_description,
    META_AUTHOR: social_sharing.site_name
  }

  // If no thread_id provided, return default meta
  if (!thread_id) {
    log('No thread_id provided, returning default meta')
    return default_meta
  }

  try {
    log(`Extracting meta data for thread ${thread_id}`)

    // Read only metadata.json instead of the full thread (avoids parsing the
    // entire timeline.jsonl which can be multiple megabytes). The metadata file
    // already contains title, short_description, and permission fields.
    const thread_base_dir = get_thread_base_directory()
    const metadata_path = path.join(thread_base_dir, thread_id, 'metadata.json')
    const metadata = await read_json_file_or_default({
      file_path: metadata_path,
      default_value: null
    })

    if (!metadata) {
      log(`Thread metadata not found for ${thread_id}, using fallback meta`)
      return {
        ...default_meta,
        PAGE_TITLE: `Thread ${thread_id} - ${social_sharing.site_name}`,
        OG_URL: `${base_url}/thread/${thread_id}`
      }
    }

    // Check permissions using metadata directly (no timeline read needed)
    const preloaded_metadata = {
      owner_public_key: metadata.user_public_key || null,
      public_read: {
        explicit:
          metadata.public_read !== undefined && metadata.public_read !== null,
        value: metadata.public_read === true
      },
      resource_type: 'thread',
      raw: metadata
    }

    const permission_result = await check_thread_permission({
      user_public_key: user_public_key || config.user_public_key,
      thread_id,
      metadata: preloaded_metadata
    })

    const is_redacted = !permission_result.read.allowed

    if (is_redacted) {
      log(`Thread ${thread_id} is redacted, using generic meta tags`)

      return {
        ...default_meta,
        PAGE_TITLE: social_sharing.redacted_content.title,
        OG_TITLE: social_sharing.redacted_content.title,
        OG_DESCRIPTION: social_sharing.redacted_content.description,
        OG_IMAGE: get_social_image_url(social_sharing.default_image),
        OG_URL: `${base_url}/thread/${thread_id}`,
        TWITTER_TITLE: social_sharing.redacted_content.title,
        TWITTER_DESCRIPTION: social_sharing.redacted_content.description,
        TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
        META_DESCRIPTION: social_sharing.redacted_content.description
      }
    }

    // Use title and description from metadata directly — sanitize for HTML attribute safety
    const title = sanitize_meta_text(
      metadata.title || `Thread ${thread_id}`,
      120
    )
    const raw_description =
      metadata.short_description || 'Conversation thread from Base system'
    const description = sanitize_meta_text(raw_description)

    // Format creation date if available
    let author_info = 'Base System'
    if (metadata.created_at) {
      const created_date = new Date(metadata.created_at)
      author_info = `Base System - ${created_date.toLocaleDateString()}`
    }

    // Generate thread-specific meta tags using configuration
    const thread_meta = {
      PAGE_TITLE: `${title} - ${social_sharing.site_name}`,
      OG_TITLE: title,
      OG_DESCRIPTION: description,
      OG_IMAGE: get_social_image_url(social_sharing.default_image),
      OG_URL: `${base_url}/thread/${thread_id}`,
      OG_TYPE: type_config.og_type,
      SITE_NAME: social_sharing.site_name,
      TWITTER_CARD: social_sharing.twitter_card_type,
      TWITTER_TITLE: title,
      TWITTER_DESCRIPTION: description,
      TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
      META_DESCRIPTION: description,
      META_AUTHOR: author_info
    }

    log(`Meta data extracted successfully for thread ${thread_id}`)
    return thread_meta
  } catch (error) {
    log(`Error extracting meta data for thread ${thread_id}: ${error.message}`)

    // Return fallback meta on error using configuration
    return {
      ...default_meta,
      PAGE_TITLE: `Thread ${thread_id} - ${social_sharing.site_name}`,
      OG_TITLE: `Thread ${thread_id}`,
      OG_DESCRIPTION: type_config.default_description,
      OG_IMAGE: get_social_image_url(social_sharing.default_image),
      OG_URL: `${base_url}/thread/${thread_id}`,
      OG_TYPE: type_config.og_type,
      TWITTER_TITLE: `Thread ${thread_id}`,
      TWITTER_DESCRIPTION: type_config.default_description,
      TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
      META_DESCRIPTION: type_config.default_description
    }
  }
}

/**
 * Get default meta data for fallback cases
 *
 * @param {string} base_url - Base URL for generating absolute URLs
 * @param {string} [path] - Optional path for URL generation
 * @returns {Object} Default meta tag data
 */
function get_default_meta_data(base_url, path = '') {
  const content_type = path ? 'entity' : 'home'
  const type_config = get_content_type_config(content_type)

  return {
    PAGE_TITLE: social_sharing.default_title,
    OG_TITLE: social_sharing.default_title,
    OG_DESCRIPTION: social_sharing.default_description,
    OG_IMAGE: get_social_image_url(social_sharing.default_image),
    OG_URL: path ? `${base_url}/${path}` : base_url,
    OG_TYPE: type_config.og_type,
    SITE_NAME: social_sharing.site_name,
    TWITTER_CARD: social_sharing.twitter_card_type,
    TWITTER_TITLE: social_sharing.default_title,
    TWITTER_DESCRIPTION: social_sharing.default_description,
    TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
    META_DESCRIPTION: social_sharing.default_description,
    META_AUTHOR: social_sharing.site_name
  }
}

/**
 * Get redacted meta data for private content
 *
 * @param {string} base_url - Base URL for generating absolute URLs
 * @param {string} [path] - Optional path for URL generation
 * @returns {Object} Redacted meta tag data
 */
function get_redacted_meta_data(base_url, path = '') {
  const content_type = path ? 'entity' : 'home'
  const type_config = get_content_type_config(content_type)

  return {
    PAGE_TITLE: social_sharing.redacted_content.title,
    OG_TITLE: social_sharing.redacted_content.title,
    OG_DESCRIPTION: social_sharing.redacted_content.description,
    OG_IMAGE: get_social_image_url(social_sharing.default_image),
    OG_URL: path ? `${base_url}/${path}` : base_url,
    OG_TYPE: type_config.og_type,
    SITE_NAME: social_sharing.site_name,
    TWITTER_CARD: social_sharing.twitter_card_type,
    TWITTER_TITLE: social_sharing.redacted_content.title,
    TWITTER_DESCRIPTION: social_sharing.redacted_content.description,
    TWITTER_IMAGE: get_social_image_url(social_sharing.default_image),
    META_DESCRIPTION: social_sharing.redacted_content.description,
    META_AUTHOR: social_sharing.site_name
  }
}

export default extract_meta_data
