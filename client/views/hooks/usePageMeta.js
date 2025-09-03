import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  extract_thread_title,
  extract_thread_description
} from '@views/utils/thread-metadata-extractor.js'

/**
 * Hook to manage page-level metadata extraction and state
 * Handles different content types (threads, entities, directory pages)
 * Returns structured data compatible with PageHead component
 */
const use_page_meta = ({
  entity_data = null,
  thread_data = null,
  custom_title = null,
  custom_description = null
} = {}) => {
  const location = useLocation()

  const page_meta = useMemo(() => {
    const pathname = location.pathname
    const base_url = window.location.origin

    // Default fallback values
    const default_meta = {
      title: 'Base - Human-in-the-Loop System',
      description: 'Agentic knowledge base management and execution system',
      tags: [],
      url: `${base_url}${pathname}`,
      image: null,
      type: 'website',
      site_name: 'Base',
      author: 'Base System',
      published_time: null,
      modified_time: null
    }

    // Custom overrides take priority
    if (custom_title || custom_description) {
      return {
        ...default_meta,
        title: custom_title || default_meta.title,
        description: custom_description || default_meta.description
      }
    }

    // Entity-specific metadata
    if (entity_data && entity_data.exists !== false) {
      const entity_title =
        entity_data.title ||
        entity_data.name ||
        `${entity_data.type || 'Entity'}`
      const entity_description =
        entity_data.description ||
        entity_data.short_description ||
        `${entity_data.type || 'Entity'} from Base system`

      return {
        ...default_meta,
        title: entity_title,
        description: entity_description,
        tags: Array.isArray(entity_data.tags) ? entity_data.tags : [],
        type: 'article',
        author: `Base System${entity_data.created_at ? ' - ' + new Date(entity_data.created_at).toLocaleDateString() : ''}`,
        published_time: entity_data.created_at || null,
        modified_time: entity_data.updated_at || entity_data.created_at || null
      }
    }

    // Thread-specific metadata
    if (thread_data && (thread_data.id || thread_data.thread_id)) {
      const thread_id = thread_data.id || thread_data.thread_id
      const thread_title =
        extract_thread_title(thread_data) || `Thread ${thread_id}`
      const thread_description =
        extract_thread_description(thread_data) ||
        'Conversation thread from Base system'

      return {
        ...default_meta,
        title: thread_title,
        description: thread_description,
        tags: Array.isArray(thread_data.tags) ? thread_data.tags : [],
        type: 'article',
        author: `Base System${thread_data.created_at ? ' - ' + new Date(thread_data.created_at).toLocaleDateString() : ''}`,
        published_time: thread_data.created_at || null,
        modified_time: thread_data.updated_at || thread_data.created_at || null
      }
    }

    // URL-based inference for different page types
    const path_parts = pathname.replace(/^\/+/, '').split('/')

    // Thread pages: /thread/:id
    if (path_parts[0] === 'thread' && path_parts[1]) {
      return {
        ...default_meta,
        title: `Thread ${path_parts[1]}`,
        description: 'Execution thread from Base system',
        type: 'article'
      }
    }

    // Entity file paths (*.md)
    if (pathname.endsWith('.md')) {
      const entity_type = path_parts[0] || 'entity'
      const file_name =
        path_parts[path_parts.length - 1]?.replace('.md', '') || 'entity'

      // Convert kebab-case filename to title case
      const entity_title = file_name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())

      return {
        ...default_meta,
        title: `${entity_title} - ${entity_type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`,
        description: `${entity_type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} from Base system`,
        type: 'article'
      }
    }

    // Directory pages for entity types
    const entity_types = [
      'task',
      'text',
      'workflow',
      'guideline',
      'tag',
      'thread',
      'physical-item',
      'physical-location'
    ]
    if (
      path_parts.length > 0 &&
      entity_types.includes(path_parts[0]) &&
      !pathname.includes('.')
    ) {
      const entity_type_name = path_parts[0]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())

      return {
        ...default_meta,
        title: `${entity_type_name} Directory`,
        description: `Browse ${entity_type_name.toLowerCase()} entities in the Base system`,
        type: 'website'
      }
    }

    // Home page
    if (pathname === '/' || pathname === '') {
      return default_meta
    }

    // General pages
    return {
      ...default_meta,
      title: `${path_parts[0] || 'Page'} - Base`,
      description: `${path_parts[0] || 'Page'} from Base system`
    }
  }, [
    location.pathname,
    entity_data,
    thread_data,
    custom_title,
    custom_description
  ])

  return page_meta
}

export default use_page_meta
