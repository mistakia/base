import debug from 'debug'
import config from '#config'
import get_thread from '#libs-server/threads/get-thread.mjs'
import {
  social_sharing,
  get_social_image_url,
  get_content_type_config
} from '#config/social-sharing.mjs'
import { redact_text_content } from '#server/middleware/content-redactor.mjs'
import { resolve_entity_from_path } from './entity-resolver.mjs'

const log = debug('server:meta-extractor')

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

    // Extract entity information for meta tags
    const title = entity_metadata.title || `${entity_metadata.type} Entity`
    const description =
      entity_metadata.description || `${entity_metadata.type} from Base system`

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

    // Get thread data with permission checking
    const thread_data = await get_thread({
      thread_id,
      user_public_key: user_public_key || config.user_public_key,
      take_last: 5 // Only get recent timeline entries for performance
    })

    // Check if content is redacted/private
    const is_redacted = thread_data.is_redacted || false

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

    // Extract thread information for meta tags with redaction if needed
    const should_redact = thread_data.is_redacted || false
    const raw_title =
      thread_data.title ||
      extract_title_from_timeline(thread_data.timeline, should_redact) ||
      `Thread ${thread_id}`
    const raw_description =
      thread_data.short_description ||
      extract_description_from_timeline(thread_data.timeline, should_redact) ||
      'Conversation thread from Base system'

    // Apply redaction to title and description if this is a private thread
    const title = should_redact ? redact_text_content(raw_title) : raw_title
    const description = should_redact
      ? redact_text_content(raw_description)
      : raw_description

    // Format creation date if available
    let author_info = 'Base System'
    if (thread_data.created_at) {
      const created_date = new Date(thread_data.created_at)
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
 * Extract title from timeline entries (first user message or workflow name)
 */
function extract_title_from_timeline(timeline, should_redact = false) {
  if (!timeline || timeline.length === 0) return null

  // Look for first user message
  for (const entry of timeline) {
    if (entry.type === 'message' && entry.data?.role === 'user') {
      const content = entry.data.content
      if (typeof content === 'string' && content.trim()) {
        // Use first line or first 60 characters
        const first_line = content.split('\n')[0].trim()
        const title =
          first_line.length > 60
            ? first_line.substring(0, 60) + '...'
            : first_line
        return should_redact ? redact_text_content(title) : title
      }
    }

    // Look for workflow execution
    if (entry.type === 'workflow_execution' && entry.data?.workflow_name) {
      const title = entry.data.workflow_name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
      return should_redact ? redact_text_content(title) : title
    }
  }

  return null
}

/**
 * Extract description from timeline entries (summary of conversation)
 */
function extract_description_from_timeline(timeline, should_redact = false) {
  if (!timeline || timeline.length === 0) return null

  // Count messages and tools
  let user_messages = 0
  let assistant_messages = 0
  let tool_calls = 0
  let has_code = false

  for (const entry of timeline) {
    if (entry.type === 'message') {
      if (entry.data?.role === 'user') {
        user_messages++
        // Check for code-related keywords (only if not redacting)
        if (!should_redact) {
          const content = entry.data.content?.toLowerCase() || ''
          if (
            content.includes('code') ||
            content.includes('function') ||
            content.includes('implement')
          ) {
            has_code = true
          }
        }
      } else if (entry.data?.role === 'assistant') {
        assistant_messages++
      }
    } else if (entry.type === 'tool_call') {
      tool_calls++
    }
  }

  // Generate descriptive summary
  const parts = []

  if (user_messages > 0)
    parts.push(`${user_messages} user message${user_messages !== 1 ? 's' : ''}`)
  if (assistant_messages > 0)
    parts.push(
      `${assistant_messages} assistant message${assistant_messages !== 1 ? 's' : ''}`
    )
  if (tool_calls > 0)
    parts.push(`${tool_calls} tool call${tool_calls !== 1 ? 's' : ''}`)

  let description = `Conversation thread with ${parts.join(', ')}`

  if (has_code && !should_redact) {
    description += ' involving code implementation'
  }

  return should_redact ? redact_text_content(description) : description
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
